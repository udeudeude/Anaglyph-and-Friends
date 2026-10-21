import type { TechniqueId, TechniqueSettings } from './techniques';
import { screenDepthParameters } from './screenDepth.ts';

export type OutputRecipe = {
    technique: TechniqueId;
    settings: TechniqueSettings;
    popOut: boolean;
    strength: number;
    swapEyes: boolean;
    retinalRivalry: boolean;
    screenDepth: number | null;
    format: 'jpeg' | 'png';
    jpegQuality: number;
};

export const directOutputTechniques = new Set<TechniqueId>([
    'anaglyph', 'parallel', 'cross', 'topbottom', 'halfsbs', 'rowinterlaced', 'columninterlaced', 'checkerboard',
]);

export function specialOutputUrl(apiUrl: string, recipe: OutputRecipe, scope: 'preview' | 'full') {
    const { technique, settings: appliedSettings, popOut, strength: appliedStrength, swapEyes, format: downloadFormat, jpegQuality, screenDepth } = recipe;
        const base: Record<string, string> = {
            scope,
            pop_out: String(popOut),
            max_disparity_percentage: String(appliedStrength),
            swap_eyes: String(swapEyes),
            format: downloadFormat,
            quality: String(jpegQuality),
            ...screenDepthParameters(screenDepth),
        };
        if (technique === 'chromadepth') {
            const s = appliedSettings.chromadepth;
            return `${apiUrl}/special/chromadepth?${new URLSearchParams({...base, color_strength: String(s.colorStrength), reverse: String(s.reverse)}).toString()}`;
        }
        if (technique === 'cardboard') {
            const s = appliedSettings.cardboard;
            return `${apiUrl}/special/cardboard?${new URLSearchParams({...base, width: String(s.width), height: String(s.height), screen_width_mm: String(s.screenWidthMm), lens_separation_mm: String(s.lensSeparationMm), image_scale: String(s.imageScale)}).toString()}`;
        }
        if (technique === 'stereoscope') {
            const s = appliedSettings.stereoscope;
            return `${apiUrl}/special/stereoscope?${new URLSearchParams({...base, dpi: String(s.dpi), card_width: String(s.cardWidth), card_height: String(s.cardHeight), image_width: String(s.imageWidth), image_height: String(s.imageHeight), gap: String(s.gap), arch: String(s.arch), title: s.title, caption: s.caption, publisher: s.publisher, card_tone: s.cardTone}).toString()}`;
        }
        if (technique === 'mirror') {
            const s = appliedSettings.mirror;
            return `${apiUrl}/special/mirror-stereoscope?${new URLSearchParams({...base, dpi: String(s.dpi), card_width: String(s.cardWidth), card_height: String(s.cardHeight), image_width: String(s.imageWidth), image_height: String(s.imageHeight), mirror_gap: String(s.mirrorGap), reflected_eye: s.reflectedEye, show_guide: String(s.showGuide)}).toString()}`;
        }
        if (technique === 'wiggle') {
            const s = appliedSettings.wiggle;
            return `${apiUrl}/special/wiggle?${new URLSearchParams({...base, frames: String(s.frames), duration: String(s.duration)}).toString()}`;
        }
        if (technique === 'pulfrich') {
            const s = appliedSettings.pulfrich;
            return `${apiUrl}/special/pulfrich?${new URLSearchParams({...base, frames: String(s.frames), duration: String(s.duration), strength: String(s.strength), dark_eye: s.darkEye}).toString()}`;
        }
        if (technique === 'randomdot' || technique === 'pattern') {
            const s = appliedSettings.autostereogram;
            return `${apiUrl}/special/autostereogram?${new URLSearchParams({...base, style: technique === 'pattern' ? 'pattern' : 'random', separation: String(s.separation), depth_strength: String(s.depthStrength), dot_size: String(s.dotSize), viewing: s.viewing, guides: String(s.guides), color: String(s.color), revision: String(s.patternRevision)}).toString()}`;
        }
        if (technique === 'lenticular') {
            const s = appliedSettings.lenticular;
            return `${apiUrl}/special/lenticular?${new URLSearchParams({...base, dpi: String(s.dpi), lpi: String(s.lpi), width_in: String(s.widthIn), height_in: String(s.heightIn), views: String(s.views), slant: String(s.slant)}).toString()}`;
        }
        throw new Error(`No special renderer for ${technique}`);
    };

export function directOutputUrl(apiUrl: string, recipe: OutputRecipe, scope: 'preview' | 'full', showRepairs = false) {
    const { technique, settings: appliedSettings, popOut, strength: appliedStrength, swapEyes, format: downloadFormat, jpegQuality, screenDepth, retinalRivalry: optimiseRRAnaglyph } = recipe;
        const calibration = appliedSettings.anaglyph[appliedSettings.anaglyph.target];
        const params = new URLSearchParams({
            scope,
            format: downloadFormat,
            quality: String(jpegQuality),
            pop_out: String(popOut),
            max_disparity_percentage: String(appliedStrength),
            swap_eyes: String(swapEyes),
            optimised_RR_anaglyph: String(optimiseRRAnaglyph),
            anaglyph_type: appliedSettings.anaglyph.glasses,
            anaglyph_color: appliedSettings.anaglyph.colorMode,
            anaglyph_target: appliedSettings.anaglyph.target,
            anaglyph_left_color: calibration.leftColor,
            anaglyph_right_color: calibration.rightColor,
            anaglyph_left_gain: String(calibration.leftGain),
            anaglyph_right_gain: String(calibration.rightGain),
            ...screenDepthParameters(screenDepth),
            repairs: String(scope === 'preview' && showRepairs),
        });
        return `${apiUrl}/output/${technique}?${params.toString()}`;
    };

export function outputFilename(recipe: OutputRecipe) {
    const { technique: activeTechnique, settings: appliedSettings, format: downloadFormat } = recipe;
        const ext = activeTechnique === 'wiggle' || activeTechnique === 'pulfrich' ? 'gif' : (activeTechnique === 'stereoscope' || activeTechnique === 'mirror' || activeTechnique === 'lenticular' ? 'png' : downloadFormat === 'png' ? 'png' : 'jpg');
        const names: Record<TechniqueId, string> = {
            anaglyph: `${appliedSettings.anaglyph.glasses}-anaglyph`,
            parallel: 'parallel-stereo',
            cross: 'cross-eyed-stereo',
            chromadepth: 'chromadepth',
            cardboard: 'cardboard-stereo',
            stereoscope: 'stereoscope-card',
            mirror: 'single-mirror-stereoscope',
            wiggle: 'wiggle-gram',
            pulfrich: 'pulfrich-motion-3d',
            randomdot: 'random-dot-stereogram',
            pattern: 'pattern-stereogram',
            lenticular: 'lenticular-interlaced',
            topbottom: 'top-bottom-stereo',
            halfsbs: 'half-width-side-by-side',
            rowinterlaced: 'row-interlaced-stereo',
            columninterlaced: 'column-interlaced-stereo',
            checkerboard: 'checkerboard-stereo',
        };
        return `${names[activeTechnique]}.${ext}`;
    };


export function finalOutputUrl(apiUrl: string, recipe: OutputRecipe) {
    if (directOutputTechniques.has(recipe.technique)) return directOutputUrl(apiUrl, recipe, 'full');
    const animated = recipe.technique === 'wiggle' || recipe.technique === 'pulfrich';
    return specialOutputUrl(apiUrl, recipe, animated ? 'preview' : 'full');
}
