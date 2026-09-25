import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { TechniqueId, TechniqueSettings } from './techniques';
import UiIcon from './UiIcon';


type Props = {
    technique: TechniqueId;
    settings: TechniqueSettings;
    setSettings: (settings: TechniqueSettings) => void;
    onApply: (settings?: TechniqueSettings) => void;
    dirty: boolean;
    disabled: boolean;
    apiUrl: string;
    workspace?: string;
};

const numberValue = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

type SavedFilterProfile = {
    name: string;
    glasses: TechniqueSettings['anaglyph']['glasses'];
    colorMode: string;
    screen: TechniqueSettings['anaglyph']['screen'];
    print: TechniqueSettings['anaglyph']['print'];
};

const FILTER_PROFILE_KEY = 'aaf-filter-profiles';

const readFilterProfiles = (): SavedFilterProfile[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(FILTER_PROFILE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.name === 'string') : [];
    } catch {
        return [];
    }
};

function TechniqueControls({ technique, settings, setSettings, onApply, dirty, disabled, apiUrl, workspace }: Props) {
    const [patternStatus, setPatternStatus] = useState('');
    const [filterProfiles, setFilterProfiles] = useState<SavedFilterProfile[]>(readFilterProfiles);
    const [filterProfileName, setFilterProfileName] = useState('');
    const update = <K extends keyof TechniqueSettings>(section: K, values: Partial<TechniqueSettings[K]>) => {
        setSettings({ ...settings, [section]: { ...settings[section], ...values } });
    };

    const applyAnaglyphPreset = (preset: TechniqueSettings['anaglyph']['glasses']) => {
        const pairs: Record<Exclude<TechniqueSettings['anaglyph']['glasses'], 'custom'>, [string, string]> = {
            'red-cyan': ['#ff0000', '#00ffff'],
            'red-green': ['#ff0000', '#00ff00'],
            'red-blue': ['#ff0000', '#0000ff'],
        };
        if (preset === 'custom') {
            update('anaglyph', { glasses: preset });
            return;
        }
        const [leftColor, rightColor] = pairs[preset];
        const target = settings.anaglyph.target;
        const current = settings.anaglyph[target];
        setSettings({
            ...settings,
            anaglyph: {
                ...settings.anaglyph,
                glasses: preset,
                [target]: { ...current, leftColor, rightColor },
            },
        });
    };

    const updateAnaglyphCalibration = (values: Partial<TechniqueSettings['anaglyph']['screen']>) => {
        const target = settings.anaglyph.target;
        setSettings({
            ...settings,
            anaglyph: {
                ...settings.anaglyph,
                glasses: 'custom',
                [target]: { ...settings.anaglyph[target], ...values },
            },
        });
    };

    const persistFilterProfiles = (profiles: SavedFilterProfile[]) => {
        setFilterProfiles(profiles);
        localStorage.setItem(FILTER_PROFILE_KEY, JSON.stringify(profiles));
    };

    const saveFilterProfile = () => {
        const name = filterProfileName.trim();
        if (!name) return;
        const profile: SavedFilterProfile = {
            name,
            glasses: settings.anaglyph.glasses,
            colorMode: settings.anaglyph.colorMode,
            screen: { ...settings.anaglyph.screen },
            print: { ...settings.anaglyph.print },
        };
        const existing = filterProfiles.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
        const next = [...filterProfiles];
        if (existing >= 0) next[existing] = profile;
        else next.push(profile);
        persistFilterProfiles(next.sort((a, b) => a.name.localeCompare(b.name)));
        setFilterProfileName(name);
    };

    const loadFilterProfile = (name: string) => {
        const profile = filterProfiles.find(item => item.name === name);
        if (!profile) return;
        setFilterProfileName(profile.name);
        setSettings({
            ...settings,
            anaglyph: {
                ...settings.anaglyph,
                glasses: profile.glasses,
                colorMode: profile.colorMode,
                screen: { ...profile.screen },
                print: { ...profile.print },
            },
        });
    };

    const deleteFilterProfile = () => {
        const name = filterProfileName.trim();
        if (!name) return;
        persistFilterProfiles(filterProfiles.filter(item => item.name !== name));
        setFilterProfileName('');
    };

    const applyCardboardPreset = (preset: TechniqueSettings['cardboard']['preset']) => {
        if (preset === 'cardboard') {
            update('cardboard', { preset, width: 1920, height: 1080, screenWidthMm: 121, lensSeparationMm: 63, imageScale: 92 });
        } else if (preset === 'generic') {
            update('cardboard', { preset, width: 1920, height: 1080, screenWidthMm: 135, lensSeparationMm: 64, imageScale: 90 });
        } else update('cardboard', { preset });
    };

    const applyStereoscopePreset = (preset: TechniqueSettings['stereoscope']['preset']) => {
        if (preset === 'holmes') {
            update('stereoscope', { preset, dpi: 300, cardWidth: 7, cardHeight: 3.5, imageWidth: 2.85, imageHeight: 2.55, gap: 0.35, arch: 0.22, cardTone: 'white' });
        } else update('stereoscope', { preset });
    };

    const applyLenticularPreset = (preset: TechniqueSettings['lenticular']['preset']) => {
        if (preset === '60lpi') update('lenticular', { preset, dpi: 600, lpi: 60, views: 6, widthIn: 6, heightIn: 4, slant: 0 });
        else if (preset === '50lpi') update('lenticular', { preset, dpi: 600, lpi: 50, views: 6, widthIn: 6, heightIn: 4, slant: 0 });
        else if (preset === '40lpi') update('lenticular', { preset, dpi: 600, lpi: 40, views: 8, widthIn: 6, heightIn: 4, slant: 0 });
        else update('lenticular', { preset });
    };

    const uploadPattern = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setPatternStatus('Uploading pattern…');
        const form = new FormData();
        form.append('file', file, file.name);
        try {
            const response = await fetch(`${apiUrl}/pattern`, { method: 'POST', body: form, credentials: 'include', headers: workspace ? { 'X-AAF-Workspace': workspace } : undefined });
            if (!response.ok) throw new Error(`Pattern upload failed: ${response.status}`);
            setPatternStatus(`Custom pattern ready: ${file.name}`);
            update('autostereogram', { patternRevision: settings.autostereogram.patternRevision + 1 });
        } catch (error) {
            console.error(error);
            setPatternStatus('Pattern upload failed.');
        }
    };

    const rebuildRandomDots = () => {
        const next: TechniqueSettings = {
            ...settings,
            autostereogram: {
                ...settings.autostereogram,
                patternRevision: settings.autostereogram.patternRevision + 1,
            },
        };
        setSettings(next);
        onApply(next);
    };

    const calibrationUrl = () => {
        const s = settings.lenticular;
        const params = new URLSearchParams({
            dpi: String(s.dpi), lpi: String(s.lpi), span: String(s.calibrationSpan),
            step: String(s.calibrationStep), width_in: String(s.calibrationWidth),
        });
        return `${apiUrl}/lenticular/calibration?${params.toString()}`;
    };

    let body = null;

    if (technique === 'anaglyph') {
        const s = settings.anaglyph;
        const calibration = s[s.target];
        const colorAmount = s.colorMode === 'full' ? 100 : s.colorMode === 'half' ? 50 : s.colorMode === 'gray' ? 0 : Math.max(0, Math.min(100, numberValue(s.colorMode, 100)));
        const setColorAmount = (amount: number) => update('anaglyph', { colorMode: amount >= 100 ? 'full' : amount <= 0 ? 'gray' : String(Math.round(amount)) });
        const colorLabel = colorAmount === 100 ? 'Full color' : colorAmount === 0 ? 'Grayscale' : colorAmount === 50 ? 'Half color' : `${colorAmount}% color`;
        body = <>
            <div className="techniqueGrid two anaglyphSettingsGrid">
                <label><span>Calibration target</span><select value={s.target} onChange={(e) => update('anaglyph', { target: e.target.value as typeof s.target })}><option value="screen">Screen / emitted light</option><option value="print">Print / reflected light</option></select></label>
                <label><span>Glasses / filter pair</span><select value={s.glasses} onChange={(e) => applyAnaglyphPreset(e.target.value as typeof s.glasses)}><option value="red-cyan">Red / Cyan</option><option value="red-green">Red / Green</option><option value="red-blue">Red / Blue</option><option value="custom">Custom / any colors</option></select></label>
            </div>
            <div className="techniqueGrid two">
                <label><span>Left-eye output color</span><div className="inlineRange"><input type="color" value={calibration.leftColor} onChange={(e) => updateAnaglyphCalibration({ leftColor: e.target.value })} /><input type="text" value={calibration.leftColor} onChange={(e) => updateAnaglyphCalibration({ leftColor: e.target.value })} /></div></label>
                <label><span>Right-eye output color</span><div className="inlineRange"><input type="color" value={calibration.rightColor} onChange={(e) => updateAnaglyphCalibration({ rightColor: e.target.value })} /><input type="text" value={calibration.rightColor} onChange={(e) => updateAnaglyphCalibration({ rightColor: e.target.value })} /></div></label>
                <label><span>Left intensity</span><div className="inlineRange"><input type="range" min="10" max="150" step="1" value={calibration.leftGain} onChange={(e) => updateAnaglyphCalibration({ leftGain: Number(e.target.value) })} /><strong>{calibration.leftGain}%</strong></div></label>
                <label><span>Right intensity</span><div className="inlineRange"><input type="range" min="10" max="150" step="1" value={calibration.rightGain} onChange={(e) => updateAnaglyphCalibration({ rightGain: Number(e.target.value) })} /><strong>{calibration.rightGain}%</strong></div></label>
            </div>
            {s.glasses !== 'custom' && <div className="colorRenderField">
                <span>Color rendering</span>
                <div className="colorRenderSlider">
                    <button type="button" onClick={() => setColorAmount(0)} className={colorAmount === 0 ? 'active' : ''}>Grayscale</button>
                    <input type="range" min="0" max="100" step="1" value={colorAmount} onChange={(e) => setColorAmount(Number(e.target.value))} aria-label="Anaglyph color rendering" />
                    <button type="button" onClick={() => setColorAmount(100)} className={colorAmount === 100 ? 'active' : ''}>Full color</button>
                </div>
                <small>{colorLabel}</small>
            </div>}
            <div className="calibrationBox">
                <div><strong>{s.target === 'screen' ? 'Screen profile' : 'Print profile'}</strong><span>Adjust the two output colors and intensities while viewing through the actual filters. Minimize the wrong-eye image rather than trying to match the apparent lens color. Screen and print values are saved separately.</span></div>
                <div className="techniqueGrid two" style={{marginTop:'10px'}}>
                    <label><span>Saved glasses / filter profile</span><select value={filterProfiles.some(item => item.name === filterProfileName) ? filterProfileName : ''} onChange={(e) => loadFilterProfile(e.target.value)}><option value="">Choose saved profile…</option>{filterProfiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name}</option>)}</select></label>
                    <label><span>Profile name</span><input type="text" maxLength={80} placeholder="e.g. Plastic red / green" value={filterProfileName} onChange={(e) => setFilterProfileName(e.target.value)} /></label>
                </div>
                <div className="presetRow" style={{marginTop:'8px'}}>
                    <button type="button" onClick={saveFilterProfile} disabled={!filterProfileName.trim()}>Save / update profile</button>
                    <button type="button" onClick={deleteFilterProfile} disabled={!filterProfiles.some(item => item.name === filterProfileName)}>Delete profile</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginTop:'10px'}}>
                    <div style={{height:'54px',background:calibration.leftColor,opacity:Math.min(1,calibration.leftGain/100),border:'1px solid #777'}} title="Left-eye calibration swatch" />
                    <div style={{height:'54px',background:calibration.rightColor,opacity:Math.min(1,calibration.rightGain/100),border:'1px solid #777'}} title="Right-eye calibration swatch" />
                </div>
                <strong className="printWarning">{s.target === 'print' ? 'PRINT THE TEST AT 100% / ACTUAL SIZE. Printer, ink, paper, and lighting all affect the result.' : 'CALIBRATE ON THE ACTUAL DISPLAY AND BRIGHTNESS YOU PLAN TO USE.'}</strong>
            </div>
            <p className="techniqueHint">Custom mode accepts any two RGB output colors and renders luminance through those calibrated colors. Screen and print profiles are independent.</p>
        </>;
    }

    if (technique === 'chromadepth') {
        const s = settings.chromadepth;
        body = <>
            <div className="techniqueGrid two">
                <label><span>Color strength</span><div className="inlineRange"><input type="range" min="20" max="100" value={s.colorStrength} onChange={(e) => update('chromadepth', { colorStrength: Number(e.target.value) })} /><strong>{s.colorStrength}%</strong></div></label>
                <label className="checkField"><span>Depth direction</span><div><input type="checkbox" checked={s.reverse} onChange={(e) => update('chromadepth', { reverse: e.target.checked })} /> Reverse near/far colors</div></label>
            </div>
            <p className="techniqueHint">Starting point: near objects render toward red and distant areas toward blue, retaining source-image brightness.</p>
        </>;
    }

    if (technique === 'cardboard') {
        const s = settings.cardboard;
        body = <>
            <div className="presetRow"><label>Viewer preset<select value={s.preset} onChange={(e) => applyCardboardPreset(e.target.value as typeof s.preset)}><option value="cardboard">Google Cardboard-style</option><option value="generic">Generic phone VR viewer</option><option value="custom">Custom viewer</option></select></label></div>
            <div className="techniqueGrid three">
                <label><span>Output width</span><input type="number" value={s.width} min="640" max="5000" onChange={(e) => update('cardboard', { width: numberValue(e.target.value, 1920), preset: 'custom' })} /><small>pixels</small></label>
                <label><span>Output height</span><input type="number" value={s.height} min="360" max="3000" onChange={(e) => update('cardboard', { height: numberValue(e.target.value, 1080), preset: 'custom' })} /><small>pixels</small></label>
                <label><span>Phone screen width</span><input type="number" value={s.screenWidthMm} step="0.1" min="70" max="200" onChange={(e) => update('cardboard', { screenWidthMm: numberValue(e.target.value, 121), preset: 'custom' })} /><small>mm</small></label>
                <label><span>Lens separation</span><input type="number" value={s.lensSeparationMm} step="0.1" min="45" max="80" onChange={(e) => update('cardboard', { lensSeparationMm: numberValue(e.target.value, 63), preset: 'custom' })} /><small>mm</small></label>
                <label><span>Image fill</span><div className="inlineRange"><input type="range" min="40" max="100" value={s.imageScale} onChange={(e) => update('cardboard', { imageScale: Number(e.target.value), preset: 'custom' })} /><strong>{s.imageScale}%</strong></div></label>
            </div>
            <p className="techniqueHint">The Cardboard starting point uses a 63 mm lens-center separation. For best alignment, enter the physical screen width and lens spacing of your viewer.</p>
        </>;
    }

    if (technique === 'stereoscope') {
        const s = settings.stereoscope;
        body = <>
            <div className="presetRow"><label>Card preset<select value={s.preset} onChange={(e) => applyStereoscopePreset(e.target.value as typeof s.preset)}><option value="holmes">Historic 7 × 3.5 in stereograph</option><option value="custom">Custom card</option></select></label></div>
            <div className="techniqueGrid four">
                <label><span>Print DPI</span><input type="number" min="72" max="1200" value={s.dpi} onChange={(e) => update('stereoscope', { dpi: numberValue(e.target.value, 300), preset: 'custom' })} /></label>
                <label><span>Card width</span><input type="number" step="0.05" value={s.cardWidth} onChange={(e) => update('stereoscope', { cardWidth: numberValue(e.target.value, 7), preset: 'custom' })} /><small>in</small></label>
                <label><span>Card height</span><input type="number" step="0.05" value={s.cardHeight} onChange={(e) => update('stereoscope', { cardHeight: numberValue(e.target.value, 3.5), preset: 'custom' })} /><small>in</small></label>
                <label><span>Image gap</span><input type="number" step="0.01" value={s.gap} onChange={(e) => update('stereoscope', { gap: numberValue(e.target.value, .35), preset: 'custom' })} /><small>in</small></label>
                <label><span>Image width</span><input type="number" step="0.05" value={s.imageWidth} onChange={(e) => update('stereoscope', { imageWidth: numberValue(e.target.value, 2.85), preset: 'custom' })} /><small>in</small></label>
                <label><span>Image height</span><input type="number" step="0.05" value={s.imageHeight} onChange={(e) => update('stereoscope', { imageHeight: numberValue(e.target.value, 2.55), preset: 'custom' })} /><small>in</small></label>
                <label><span>Top arch depth</span><input type="number" step="0.01" value={s.arch} onChange={(e) => update('stereoscope', { arch: numberValue(e.target.value, .22), preset: 'custom' })} /><small>in</small></label>
            </div>
            <div className="colorRenderField">
                <span>Card treatment</span>
                <div className="colorRenderSlider">
                    <button type="button" onClick={() => update('stereoscope', { cardTone: 'white' })} className={s.cardTone !== 'black' ? 'active' : ''}>Black text on white</button>
                    <button type="button" onClick={() => update('stereoscope', { cardTone: 'black' })} className={s.cardTone === 'black' ? 'active' : ''}>White text on black</button>
                </div>
                <small>White is the ink-saving default. Black reverses the mount and labeling for a dark card.</small>
            </div>
            <div className="textFields">
                <label>Title<input type="text" maxLength={100} value={s.title} onChange={(e) => update('stereoscope', { title: e.target.value })} /></label>
                <label>Caption<input type="text" maxLength={160} value={s.caption} onChange={(e) => update('stereoscope', { caption: e.target.value })} /></label>
                <label>Publisher / credit<input type="text" maxLength={120} value={s.publisher} onChange={(e) => update('stereoscope', { publisher: e.target.value })} /></label>
            </div>
            <p className="techniqueHint">The standard preset uses a white 7 × 3.5 inch card, rounded albumen-style arches, a thin photograph keyline, and period-style serif labeling. Use the dark-card button for white labeling on black.</p>
        </>;
    }

    if (technique === 'mirror') {
        const s = settings.mirror;
        body = <>
            <div className="techniqueGrid four">
                <label><span>Print DPI</span><input type="number" min="72" max="1200" value={s.dpi} onChange={(e) => update('mirror', { dpi: numberValue(e.target.value, 300) })} /></label>
                <label><span>Card width</span><input type="number" step="0.05" min="2" max="20" value={s.cardWidth} onChange={(e) => update('mirror', { cardWidth: numberValue(e.target.value, 8) })} /><small>in</small></label>
                <label><span>Card height</span><input type="number" step="0.05" min="2" max="20" value={s.cardHeight} onChange={(e) => update('mirror', { cardHeight: numberValue(e.target.value, 4) })} /><small>in</small></label>
                <label><span>Mirror gap</span><input type="number" step="0.01" min="0" max="4" value={s.mirrorGap} onChange={(e) => update('mirror', { mirrorGap: numberValue(e.target.value, .5) })} /><small>in</small></label>
                <label><span>Image width</span><input type="number" step="0.05" min="0.5" max="10" value={s.imageWidth} onChange={(e) => update('mirror', { imageWidth: numberValue(e.target.value, 3) })} /><small>in</small></label>
                <label><span>Image height</span><input type="number" step="0.05" min="0.5" max="10" value={s.imageHeight} onChange={(e) => update('mirror', { imageHeight: numberValue(e.target.value, 3) })} /><small>in</small></label>
                <label><span>Reflected eye</span><select value={s.reflectedEye} onChange={(e) => update('mirror', { reflectedEye: e.target.value as typeof s.reflectedEye })}><option value="right">Right eye image</option><option value="left">Left eye image</option></select></label>
                <label className="checkField"><span>Mirror placement guide</span><div><input type="checkbox" checked={s.showGuide} onChange={(e) => update('mirror', { showGuide: e.target.checked })} /> Show center/gap guide</div></label>
            </div>
            <p className="techniqueHint">The selected reflected eye is horizontally reversed in the output so a vertical mirror restores it. Geometry is intentionally generic rather than claiming to match the DK book or another physical viewer until measured.</p>
        </>;
    }

    if (technique === 'wiggle') {
        const s = settings.wiggle;
        const fps = (1000 / Math.max(1, s.duration)).toFixed(1);
        body = <>
            <div className="techniqueGrid two">
                <label><span>Unique viewpoints</span><input type="number" min="2" max="15" value={s.frames} onChange={(e) => update('wiggle', { frames: numberValue(e.target.value, 7) })} /><small>plays forward and back</small></label>
                <label><span>Frame time</span><input type="number" min="40" max="300" step="5" value={s.duration} onChange={(e) => update('wiggle', { duration: numberValue(e.target.value, 75) })} /><small>ms · about {fps} fps</small></label>
            </div>
            <p className="techniqueHint">Default playback is now quicker. Downloaded GIFs use a playback-optimized image size so large source files do not make GIF viewers miss their intended frame timing.</p>
        </>;
    }

    if (technique === 'pulfrich') {
        const s = settings.pulfrich;
        const fps = (1000 / Math.max(1, s.duration)).toFixed(1);
        const cycle = (s.frames * s.duration / 1000).toFixed(2);
        body = <>
            <div className="techniqueGrid two">
                <label><span>Darkened eye</span><select value={s.darkEye} onChange={(e) => update('pulfrich', { darkEye: e.target.value as typeof s.darkEye })}><option value="right">Right eye</option><option value="left">Left eye</option></select></label>
                <label><span>Motion depth</span><div className="inlineRange"><input type="range" min="0.2" max="6" step="0.1" value={s.strength} onChange={(e) => update('pulfrich', { strength: Number(e.target.value) })} /><strong>{s.strength.toFixed(1)}%</strong></div></label>
                <label><span>Frames per cycle</span><input type="number" min="6" max="30" value={s.frames} onChange={(e) => update('pulfrich', { frames: numberValue(e.target.value, 16) })} /><small>smooth horizontal oscillation</small></label>
                <label><span>Frame time</span><input type="number" min="35" max="250" step="5" value={s.duration} onChange={(e) => update('pulfrich', { duration: numberValue(e.target.value, 70) })} /><small>ms · about {fps} fps</small></label>
            </div>
            <div className="calibrationBox">
                <div><strong>Viewing setup</strong><span>Use a neutral-density / dark filter over the selected eye and keep your head level. The animation should move smoothly side to side; the delayed darkened eye converts that motion into an apparent depth offset.</span></div>
                <strong className="printWarning">NOT AN ANAGLYPH FILTER. Use a gray/dark neutral-density filter over one eye only.</strong>
            </div>
            <p className="techniqueHint">Current cycle: about {cycle} seconds. If the depth appears reversed, switch which eye is darkened. Stronger motion can increase the effect but also increases edge distortion.</p>
        </>;
    }

    if (technique === 'randomdot' || technique === 'pattern') {
        const s = settings.autostereogram;
        body = <>
            <div className="techniqueGrid three">
                <label><span>Viewing method</span><select value={s.viewing} onChange={(e) => update('autostereogram', { viewing: e.target.value as typeof s.viewing })}><option value="parallel">Parallel / wall-eyed</option><option value="cross">Cross-eyed</option></select></label>
                <label><span>Base separation</span><input type="number" min="3" max="20" step="0.1" value={s.separation} onChange={(e) => update('autostereogram', { separation: numberValue(e.target.value, 8) })} /><small>% of image width</small></label>
                <label><span>Depth strength</span><input type="number" min="0.2" max="6" step="0.1" value={s.depthStrength} onChange={(e) => update('autostereogram', { depthStrength: numberValue(e.target.value, 2.3) })} /><small>% of image width</small></label>
                <label className="checkField"><span>Fusion guides</span><div><input type="checkbox" checked={s.guides} onChange={(e) => update('autostereogram', { guides: e.target.checked })} /> Show two guide dots above image</div></label>
                {technique === 'randomdot' && <label><span>Dot size</span><input type="number" min="1" max="12" value={s.dotSize} onChange={(e) => update('autostereogram', { dotSize: numberValue(e.target.value, 3) })} /><small>pixels at preview scale</small></label>}
                {technique === 'randomdot' && <label className="checkField"><span>Dot palette</span><div><input type="checkbox" checked={s.color} onChange={(e) => update('autostereogram', { color: e.target.checked })} /> Use colored dots</div></label>}
            </div>
            {technique === 'randomdot' && <div className="randomDotActions"><button type="button" onClick={rebuildRandomDots} disabled={disabled}>Build a new random-dot pattern</button><span>Try another seed pattern without changing the depth or viewing settings.</span></div>}
            {technique === 'pattern' && <div className="patternUpload"><label>Custom repeating pattern<input type="file" accept="image/*" onChange={uploadPattern} /></label><span>{patternStatus || 'Optional. A built-in houndstooth texture is used until you upload one.'}</span></div>}
            <p className="techniqueHint">These are single-image autostereograms. The two guide dots are separated by one base pattern repeat. Fuse them into a central dot using the selected viewing method.</p>
        </>;
    }

    if (technique === 'lenticular') {
        const s = settings.lenticular;
        body = <>
            <div className="presetRow"><label>Starting preset<select value={s.preset} onChange={(e) => applyLenticularPreset(e.target.value as typeof s.preset)}><option value="60lpi">60 LPI sheet · 600 DPI · 6 views</option><option value="50lpi">50 LPI sheet · 600 DPI · 6 views</option><option value="40lpi">40 LPI sheet · 600 DPI · 8 views</option><option value="custom">Custom calibrated setup</option></select></label></div>
            <div className="techniqueGrid four">
                <label><span>Printer DPI</span><input type="number" min="150" max="2400" value={s.dpi} onChange={(e) => update('lenticular', { dpi: numberValue(e.target.value, 600), preset: 'custom' })} /></label>
                <label><span>Measured sheet pitch</span><input type="number" min="10" max="200" step="0.01" value={s.lpi} onChange={(e) => update('lenticular', { lpi: numberValue(e.target.value, 60), preset: 'custom' })} /><small>LPI</small></label>
                <label><span>Print width</span><input type="number" min="1" max="30" step="0.1" value={s.widthIn} onChange={(e) => update('lenticular', { widthIn: numberValue(e.target.value, 6), preset: 'custom' })} /><small>in</small></label>
                <label><span>Print height</span><input type="number" min="1" max="30" step="0.1" value={s.heightIn} onChange={(e) => update('lenticular', { heightIn: numberValue(e.target.value, 4), preset: 'custom' })} /><small>in</small></label>
                <label><span>View count</span><input type="number" min="2" max="16" value={s.views} onChange={(e) => update('lenticular', { views: numberValue(e.target.value, 6), preset: 'custom' })} /></label>
                <label><span>Lenticule slant</span><input type="number" min="-10" max="10" step="0.01" value={s.slant} onChange={(e) => update('lenticular', { slant: numberValue(e.target.value, 0), preset: 'custom' })} /><small>degrees</small></label>
            </div>
            <div className="calibrationBox">
                <div><strong>Printer + sheet calibration</strong><span>Print this before processing the final image. Find the band with the cleanest transition / least moiré, then enter that LPI above.</span></div>
                <div className="techniqueGrid three compact">
                    <label><span>Test ±</span><input type="number" min="0.1" max="5" step="0.1" value={s.calibrationSpan} onChange={(e) => update('lenticular', { calibrationSpan: numberValue(e.target.value, .5) })} /><small>LPI</small></label>
                    <label><span>Test step</span><input type="number" min="0.02" max="1" step="0.01" value={s.calibrationStep} onChange={(e) => update('lenticular', { calibrationStep: numberValue(e.target.value, .1) })} /><small>LPI</small></label>
                    <label><span>Strip width</span><input type="number" min="2" max="20" step="0.5" value={s.calibrationWidth} onChange={(e) => update('lenticular', { calibrationWidth: numberValue(e.target.value, 8) })} /><small>in</small></label>
                </div>
                <a className="calibrationDownload" href={calibrationUrl()}><UiIcon name="download" /> Download black/white calibration bars</a>
                <strong className="printWarning">PRINT AT 100% / ACTUAL SIZE. Disable all fit-to-page scaling.</strong>
            </div>
        </>;
    }

    if (!body) return null;

    return <section className="techniqueSettings">
        <div className="techniqueSettingsHeader"><div><span className="panelLabel">TECHNIQUE SETTINGS</span><strong>Settings for this viewing method</strong></div><button className={dirty ? 'applyTechnique dirty' : 'applyTechnique'} onClick={() => onApply()} disabled={disabled || !dirty}>{dirty ? 'Apply settings' : 'Settings applied'}</button></div>
        {body}
    </section>;
}

export default TechniqueControls;
