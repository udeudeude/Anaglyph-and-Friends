# Phantogram geometry and testing

A phantogram is a distorted left/right pair printed on a flat plane. Each eye's print image is the ray projection of a 3D point through that eye to the paper. The point on the paper is not generally where the 3D point would sit in a front-facing picture. The geometric method follows the [published handheld phantogram work](https://dl.acm.org/doi/10.1145/1979742.1979771). A homography can rectify points **on** a photographed plane, but it cannot recover elevated points from a single photo without additional camera/scene geometry; see [MIT's treatment of planar homographies](https://visionbook.mit.edu/homography.html).

## Choose a source

| Mode | What the software knows | Limit |
| --- | --- | --- |
| Built-in test cube or imported GLB/OBJ/STL | Explicit triangles. The left and right eyes project each surface independently with a depth buffer. GLB's Y-up coordinates are rotated to print Z-up; width, depth, and height keep one common scale. Both projected silhouettes are fitted inside the page. | Model units are normalized to fit within the selected maximum footprint and height; the whole model may shrink to fit the projection, without changing its shape. Enter a plausible height and measured eye position; the program does not know the object's real-world scale from the file alone. |
| Image + depth map | A textured height field across the print. Either Depth Anything V2 or V3, or an edited/imported map, can supply relative nearness. | An arbitrary photograph is **not** a top-down image of a physical height field. Neither depth generator by itself tells us the original camera pose, floor, or metric object height. A better depth estimate may improve the shape but cannot repair these missing facts. |
| Marked ground plane | Four user-selected corners of a real, flat rectangle, rectified to the chosen print aspect ratio; the depth map then supplies an approximate relief. | The planar correction applies exactly to the marked plane only. It does not fully reconstruct objects above it; source-camera calibration and true height still require more information. Crossed or collapsed corners are rejected. |

The image modes now default to grayscale through each anaglyph channel. Direct source colors can make a red or cyan object disappear for one eye. The previous color-channel method remains available in the advanced color control.

For all modes, the **top of the upright image is the far edge** of the paper; the **bottom is the near edge**, toward the viewer. This matches the far-left/far-right/near-right/near-left ground-plane corner order. Earlier model output stretched height independently of width and depth, turning the test cube into a slab; earlier relief and model rasters also treated the top image row as the near edge. Both errors are corrected in the projection paths and covered by software tests. The physical effect still needs real-world validation.

Model import accepts **binary GLB 2.0**, **OBJ geometry**, and **binary or ASCII STL**. The importer reads triangles (triangulating OBJ polygon faces); it does not load standalone `.gltf` files, OBJ material/texture files, or model textures. GLB support is for embedded, conventional triangle primitives, not every glTF extension or compressed/sparse accessor.

## Physical check

1. In Phantogram, select **3D model → Use test cube**. Enter the intended print size, eye separation, height of the eyes above the flat print, distance of the eyes beyond the near edge, and maximum cube height. The starting values are examples, not measurements of your setup.
2. Download the 100 mm ruler and print it at **Actual Size**. Measure its marks. Then download and print the test cube at **Actual Size** with the same printer settings, flat on a horizontal surface with the **bottom edge of the upright image toward you**.
3. Wear the selected red/cyan (or other selected) glasses; place your eyes at the entered location. The block should appear above the page. The on-screen image is the flat print artwork and is not an optical preview from your eye location.
4. If it fails, record the print's measured width/height, ruler length, eye height and distance from near edge, glasses colors, and whether the block appears flat, inverted, double, or displaced. A photo of the printed sheet from the intended viewing location is useful. These observations are needed for final printer/filter/viewer calibration.

The software tests check zero-relief registration, the direction of raised-image displacement on the upright print, analytical left/right projection positions, ground-plane corner validation, model up-axis and uniform 3D scale, and red subject visibility in both eyes. They do not substitute for a physical print and glasses test. The hosted backend remains free of server-side AI dependencies; V2/V3 depth estimation happens in the browser.

The hosted image renderer rejects full-resolution output above seven million pixels with an actionable error. A measured 8 × 6 inch, 600 DPI relief render peaked near 597 MB in the cloud test environment, which exceeds the intended free-instance budget. Lower DPI/size or the local edition can produce that output; preview remains available.
