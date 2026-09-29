# Layered Transparency

Studio's **More techniques → Print → Layered Transparency** turns the current source image and active depth map into a front-to-back set of printable planes. It uses the user's browser for the image work; the hosted server only supplies the existing depth map. This is separate from **Layered 3D Composite**, which places a foreground image into a digital stereo pair.

## Prepare and assemble

1. Load a photograph in Studio and generate, import, or edit its depth map. Bright depth values mean near by default. Check the map before opening this technique.
2. Choose 2–10 sheets. The default is 10 to match a ten-card Rack-O rack; no Rack-O dimensions or slot spacing are encoded. Each output sheet has a matching number, starting with **1 nearest the viewer**. A separate measured-gap input describes a different physical holder but cannot give a monocular depth map absolute scale.
3. Adjust **Background compressed onto back sheet**. It assigns the specified far end of the normalized depth range to one back sheet. The rest of the depth range is evenly divided among the other sheets. Empty depth bands can produce nearly blank pages; editing the depth map can improve the allocation.
4. Choose artwork width. Height follows the source aspect ratio. The 2.5-inch initial width is an editable example print size, **not** a measured Rack-O card or slot dimension. Each numbered image is centered on a US Letter page, with the same trim border and registration corners. Print at 100% / Actual Size, never Fit to Page. Cut and arrange the sheets in numbered order. Verify that trimmed sheets fit your actual holder.
5. Use transparent printable film appropriate to the printer. On an ordinary printer, white image pixels normally deposit no white ink, so underlying planes show through them. The matching **white backing cut guides** have contour lines for opaque paper placed behind selected color areas, or paint white behind the colored shapes on the film. The cut-guide page and transparency page of the same number share the same position and print scale. Keep their orientation and registration marks aligned. Professional white-ink processes may require their own spot-color/underbase setup; these cut guides are ordinary paper guides, not a white-ink channel.

## What to expect

- The visible image from straight ahead is divided among physically separated planes. Moving sideways creates actual parallax. It is a **discrete** depth stack, not a solid volume or a hologram.
- A single photograph contains no pixels for surfaces hidden behind foreground objects. Moving sideways can reveal unpainted holes. Raising background compression gathers more of the *visible* distant pixels on the back sheet; it does not invent hidden scenery. Retouching the source or painting a background is necessary for those holes.
- White backing strengthens color and occludes sheets behind it. Leave selected areas unbacked for translucent effects. Tiny isolated mask contours can be impractical to cut; painting or specialist white ink may be easier.
- Foreground edges can expose halos when the depth map is inaccurate. Improve the depth map, then refresh it in this technique. Better lighting, neutral backing, stable alignment, and less ambitious viewing angles make the physical effect clearer.

Rack-O rules describe ten card positions, but published rules do not specify the physical slot gap or card support dimensions. Those remain user-supplied measurements. The software's depth assignment assumes equally spaced planes; a measured gap changes physical assembly information, not the source image's unknown absolute depth.
