export type TechniqueId =
    | 'anaglyph'
    | 'parallel'
    | 'cross'
    | 'chromadepth'
    | 'cardboard'
    | 'stereoscope'
    | 'mirror'
    | 'wiggle'
    | 'pulfrich'
    | 'randomdot'
    | 'pattern'
    | 'lenticular'
    | 'topbottom'
    | 'halfsbs'
    | 'rowinterlaced'
    | 'columninterlaced'
    | 'checkerboard';

export type FilterCalibration = { leftColor: string; rightColor: string; leftGain: number; rightGain: number };

export type TechniqueSettings = {
    anaglyph: {
        glasses: 'red-cyan' | 'red-green' | 'red-blue' | 'custom';
        colorMode: string;
        target: 'screen' | 'print';
        screen: FilterCalibration;
        print: FilterCalibration;
    };
    chromadepth: { colorStrength: number; reverse: boolean };
    cardboard: {
        preset: 'cardboard' | 'generic' | 'custom';
        width: number; height: number; screenWidthMm: number; lensSeparationMm: number; imageScale: number;
    };
    stereoscope: {
        preset: 'holmes' | 'custom';
        dpi: number; cardWidth: number; cardHeight: number; imageWidth: number; imageHeight: number;
        gap: number; arch: number; title: string; caption: string; publisher: string;
        cardTone: 'cream' | 'tan' | 'gray' | 'black' | 'white';
    };
    mirror: {
        dpi: number; cardWidth: number; cardHeight: number; imageWidth: number; imageHeight: number;
        mirrorGap: number; reflectedEye: 'left' | 'right'; showGuide: boolean;
    };
    wiggle: { frames: number; duration: number };
    pulfrich: { frames: number; duration: number; strength: number; darkEye: 'left' | 'right' };
    autostereogram: {
        separation: number; depthStrength: number; dotSize: number; viewing: 'parallel' | 'cross'; color: boolean; guides: boolean; patternRevision: number;
    };
    lenticular: {
        preset: '60lpi' | '50lpi' | '40lpi' | 'custom';
        dpi: number; lpi: number; widthIn: number; heightIn: number; views: number; slant: number;
        calibrationSpan: number; calibrationStep: number; calibrationWidth: number;
    };
};

export const defaultTechniqueSettings: TechniqueSettings = {
    anaglyph: {
        glasses: 'red-cyan',
        colorMode: 'full',
        target: 'screen',
        screen: { leftColor: '#ff0000', rightColor: '#00ffff', leftGain: 100, rightGain: 100 },
        print: { leftColor: '#ff0000', rightColor: '#00ffff', leftGain: 100, rightGain: 100 },
    },
    chromadepth: { colorStrength: 90, reverse: false },
    cardboard: {
        preset: 'cardboard',
        width: 1920,
        height: 1080,
        screenWidthMm: 121,
        lensSeparationMm: 63,
        imageScale: 92,
    },
    stereoscope: {
        preset: 'holmes',
        dpi: 300,
        cardWidth: 7,
        cardHeight: 3.5,
        imageWidth: 2.85,
        imageHeight: 2.55,
        gap: 0.35,
        arch: 0.22,
        title: 'STEREOSCOPIC VIEW',
        caption: 'Generated from a single photograph',
        publisher: 'Anaglyph & Friends',
        cardTone: 'white',
    },
    mirror: {
        dpi: 300,
        cardWidth: 8,
        cardHeight: 4,
        imageWidth: 3,
        imageHeight: 3,
        mirrorGap: 0.5,
        reflectedEye: 'right',
        showGuide: true,
    },
    wiggle: { frames: 7, duration: 75 },
    pulfrich: { frames: 16, duration: 70, strength: 2.0, darkEye: 'right' },
    autostereogram: { separation: 8, depthStrength: 2.3, dotSize: 3, viewing: 'parallel', color: false, guides: true, patternRevision: 0 },
    lenticular: {
        preset: '60lpi',
        dpi: 600,
        lpi: 60,
        widthIn: 6,
        heightIn: 4,
        views: 6,
        slant: 0,
        calibrationSpan: 0.5,
        calibrationStep: 0.1,
        calibrationWidth: 8,
    },
};

export const techniqueInfo: Record<TechniqueId, {label: string; description: string; family: string}> = {
    anaglyph: { label: 'Anaglyph', description: 'Color-filter stereo with standard or fully custom filter profiles for screen and print.', family: 'Glasses' },
    parallel: { label: 'Parallel', description: 'Left eye on left for relaxed / wall-eyed viewing without glasses.', family: 'Unaided stereo' },
    cross: { label: 'Cross-Eyed', description: 'Stereo pair swapped for cross-eyed viewing without glasses.', family: 'Unaided stereo' },
    chromadepth: { label: 'ChromaDepth', description: 'Encodes depth as spectral color for ChromaDepth glasses.', family: 'Glasses' },
    cardboard: { label: 'Cardboard / Phone Viewer', description: 'Side-by-side stereo positioned for a phone VR viewer.', family: 'Viewers' },
    stereoscope: { label: 'Traditional Stereoscope Card', description: 'Printable arched stereograph card with mount and text.', family: 'Viewers' },
    mirror: { label: 'Single-Mirror Stereoscope', description: 'Side-by-side stereo arranged around a center mirror gap, with one eye image horizontally reversed for reflection.', family: 'Viewers' },
    wiggle: { label: 'Wiggle-gram', description: 'Animated virtual viewpoints that reveal depth without glasses.', family: 'Animation' },
    pulfrich: { label: 'Pulfrich Motion 3D', description: 'Depth-driven horizontal motion intended for viewing with a neutral-density filter over one eye.', family: 'Animation / filter' },
    randomdot: { label: 'Random-Dot Stereogram', description: 'Single-image autostereogram generated entirely from depth.', family: 'Autostereograms' },
    pattern: { label: 'Pattern Stereogram', description: 'Autostereogram using a repeating texture or your own pattern.', family: 'Autostereograms' },
    lenticular: { label: 'Lenticular 3D', description: 'Multi-view interlaced print matched to lenticular sheet and printer.', family: 'Print' },
    topbottom: { label: 'Top / Bottom Stereo', description: 'Full left and right frames stacked vertically for compatible displays and video workflows.', family: 'Display compatibility' },
    halfsbs: { label: 'Half-Width Side-by-Side', description: 'Each eye compressed to half width in one standard-size frame.', family: 'Display compatibility' },
    rowinterlaced: { label: 'Row-Interlaced', description: 'Alternating image rows carry left and right eye views.', family: 'Display compatibility' },
    columninterlaced: { label: 'Column-Interlaced', description: 'Alternating image columns carry left and right eye views.', family: 'Display compatibility' },
    checkerboard: { label: 'Checkerboard Stereo', description: 'Left and right eye samples alternate in a checkerboard pattern.', family: 'Display compatibility' },
};

export const stereoBasedTechniques = new Set<TechniqueId>([
    'anaglyph', 'parallel', 'cross', 'cardboard', 'stereoscope', 'mirror', 'wiggle', 'lenticular',
    'topbottom', 'halfsbs', 'rowinterlaced', 'columninterlaced', 'checkerboard',
]);

export function mergeStoredSettings(raw: string | null): TechniqueSettings {
    if (!raw) return structuredClone(defaultTechniqueSettings);
    try {
        const parsed = JSON.parse(raw);
        const storedWiggle = { ...defaultTechniqueSettings.wiggle, ...(parsed.wiggle || {}) };
        if (parsed.wiggle?.duration === 130) storedWiggle.duration = defaultTechniqueSettings.wiggle.duration;
        const storedAnaglyph = {
            ...defaultTechniqueSettings.anaglyph,
            ...(parsed.anaglyph || {}),
            screen: { ...defaultTechniqueSettings.anaglyph.screen, ...(parsed.anaglyph?.screen || {}) },
            print: { ...defaultTechniqueSettings.anaglyph.print, ...(parsed.anaglyph?.print || {}) },
        };
        if (typeof storedAnaglyph.colorMode === 'number') storedAnaglyph.colorMode = String(storedAnaglyph.colorMode);
        const storedStereoscope = { ...defaultTechniqueSettings.stereoscope, ...(parsed.stereoscope || {}) };
        if (storedStereoscope.cardTone === 'cream' || storedStereoscope.cardTone === 'tan') storedStereoscope.cardTone = 'white';
        return {
            anaglyph: storedAnaglyph,
            chromadepth: { ...defaultTechniqueSettings.chromadepth, ...(parsed.chromadepth || {}) },
            cardboard: { ...defaultTechniqueSettings.cardboard, ...(parsed.cardboard || {}) },
            stereoscope: storedStereoscope,
            mirror: { ...defaultTechniqueSettings.mirror, ...(parsed.mirror || {}) },
            wiggle: storedWiggle,
            pulfrich: { ...defaultTechniqueSettings.pulfrich, ...(parsed.pulfrich || {}) },
            autostereogram: { ...defaultTechniqueSettings.autostereogram, ...(parsed.autostereogram || {}) },
            lenticular: { ...defaultTechniqueSettings.lenticular, ...(parsed.lenticular || {}) },
        };
    } catch {
        return structuredClone(defaultTechniqueSettings);
    }
}
