# Main character: image prompts for AI 3D generation

Prompts for making the player character ("the tycoon") with an image
generator (Midjourney, GPT Image, Flux, Ideogram, Nano Banana, ...) and then
an image-to-3D tool (Meshy, Tripo, Rodin, Hunyuan3D, ...).

The character has to fit the game's look: Kenney "Mini Characters"
proportions (big head, short body), flat matte colours, the bright car wash
palette, and a silhouette that reads from a high three-quarter camera on a
phone screen.

## Character brief (the same in every prompt)

A young, cheerful car wash tycoon who owns the whole town's car washes.

| Part | Look | Colour |
|---|---|---|
| Hair | tidy ginger quiff | `#d9733a` |
| Glasses | square black frames | `#1c1c22` |
| Jacket | navy suit jacket, buttoned, short and boxy | `#2a3350` |
| Shirt | white, collar showing | `#f4f6f8` |
| Tie | red | `#c8282f` |
| Pocket square | bubble blue | `#5bbcff` |
| Lapel pin | small soap bubble pin | `#8fe3ff` |
| Watch | slim gold | `#ffc24a` |
| Trousers | navy suit trousers | `#2a3350` |
| Shoes | black | `#1b1b20` |

The blue pocket square and bubble pin tie him to the game's brand (the staff
wear teal `#22c3c9` polos), so he stands out from them in navy but still
belongs.

---

## 1. Concept art: pick the look first

Make several of these, then choose the one you like before going on.

```
Full-body character concept of a cheerful young car wash tycoon for a cozy
mobile tycoon game. Stylized chibi 3D game character in the style of
low-poly mini characters: oversized round head about one third of total
height, short stubby body, short legs, simple rounded mitten hands. Tidy
ginger quiff hairstyle, square black glasses, big friendly smile, rosy
cheeks. Wearing a boxy navy blue suit jacket, crisp white shirt collar, red
tie, bubble-blue pocket square, a tiny soap-bubble lapel pin, slim gold
watch, navy suit trousers, chunky black shoes. Confident, playful pose with
a thumbs up. Flat matte colors, simple shapes, soft clay-like 3D render,
soft studio lighting, bright cheerful pastel palette, plain light gray
background, centered, full body visible head to toe.
```

## 2. Turnaround sheet: the main input for 3D

Use your chosen concept image as a **reference / character reference**
image together with this prompt.

```
Character turnaround reference sheet of the same chibi car wash tycoon,
four views side by side on one sheet: front view, left side view, back
view, three-quarter view. Exact same character, same proportions and same
height in every view, aligned on one ground line. Neutral A-pose: standing
straight, arms held down and out at 45 degrees away from the body, hands
open and relaxed, feet shoulder-width apart, legs not touching. Neutral
calm smile, looking straight ahead. Oversized round head one third of total
height, short stubby body, simple mitten hands. Ginger quiff hair, square
black glasses, navy suit jacket, white shirt collar, red tie, bubble-blue
pocket square, small bubble lapel pin, gold watch, navy trousers, black
shoes. Orthographic camera, no perspective distortion. Flat matte colors,
no texture detail, even soft lighting with no cast shadows, pure white
background. Stylized low-poly 3D game asset, clean readable silhouette.
```

## 3. Single front view: for single-image 3D tools

Most image-to-3D tools give the cleanest mesh from one front image with
nothing else in it.

```
Single front view of a chibi stylized 3D game character, a cheerful young
car wash tycoon, full body from head to toe, centered in frame. Neutral
A-pose: standing straight facing the camera, arms down and out at 45
degrees, not touching the body, hands open, feet slightly apart. Oversized
round head one third of total height, short stubby body, simple rounded
mitten hands. Tidy ginger quiff, square black glasses, friendly closed-mouth
smile. Navy blue boxy suit jacket, white shirt collar, red tie, bubble-blue
pocket square, small soap-bubble lapel pin, slim gold watch, navy trousers,
chunky black shoes. Orthographic front camera at chest height. Flat matte
colors, smooth simple surfaces, soft even lighting, no shadows, no
reflections, plain pure white background, nothing else in the image.
Low-poly mobile game asset.
```

## 4. Side and back views: for multi-view 3D tools

Use the front-view image from prompt 3 as the reference image, then run
each prompt.

**Side:**
```
Exact same character as the reference image, now seen in a perfect left
side profile view, full body. Same A-pose with arms down and out at 45
degrees, same proportions, same outfit and colors. Orthographic camera,
flat matte colors, even lighting, no shadows, pure white background.
```

**Back:**
```
Exact same character as the reference image, now seen from directly
behind, full body back view. Same A-pose with arms down and out at 45
degrees, same proportions, back of the ginger hair and navy suit jacket
visible, same colors. Orthographic camera, flat matte colors, even
lighting, no shadows, pure white background.
```

## Negative prompt

For tools that take one (Stable Diffusion, Flux, Leonardo, ...):

```
realistic, photorealistic, realistic human proportions, tall, slim, long
legs, detailed fingers, extra fingers, extra limbs, missing limbs,
cropped, cut off feet, out of frame, multiple characters, background
scenery, props, car, cast shadow, floor shadow, dramatic lighting, rim
light, glossy, shiny, reflections, fabric wrinkles, texture noise, text,
watermark, logo, blurry, low resolution, perspective distortion, fish-eye,
T-pose, arms raised, arms touching body, holding objects, hands in pockets
```

---

## Other looks to try

Swap these into the concept prompt in place of the outfit to test other
ideas before choosing.

- **Hands-on owner:** "rolled-up white shirt sleeves, navy waistcoat, red tie
  tucked into the shirt, teal rubber gloves, rolled navy trousers, white
  rubber boots, a few soap bubbles on the shoulder"
- **Flashy mogul:** "bubble-blue suit with white pinstripes, gold tie, gold
  chain, white sneakers, small rounded sunglasses pushed up into the hair"
- **Female tycoon:** "ginger bob haircut, square black glasses, navy blazer
  and pencil skirt, white blouse, red neck scarf, bubble-blue pocket
  square, gold watch, black flat shoes"

## Tips for a model that works in the game

- **Make the concept first, then the turnaround.** Pass the chosen image as
  a reference each time so the character stays the same between images.
- **A-pose, arms out, legs apart.** Gaps between arms and body and between
  the legs let the 3D tool and the auto-rigger separate them. A T-pose works
  too, but A-pose deforms better at the shoulders.
- **Mitten hands, no fingers.** AI fingers come out wrong, and the game
  never needs them at this camera distance.
- **No shadows, no props, plain background.** Shadows get baked into the
  texture; props get fused into the mesh. The game draws its own blob
  shadow.
- **Flat colours.** The game uses flat Lambert colours, so a detailed
  texture would look out of place next to the rest of the cast.
- **When ordering the 3D model:** ask for a low-poly mesh (about 3,000 to
  8,000 triangles), a single small texture (512 or 1024 px), and GLB output.
  The current tycoon GLB is about 150 KB; aim for under 1 MB.
- **Rigging and animation:** the game plays clips named `idle`, `walk`,
  `jog`, `sprint` and `interact-right` (`src/render/models/person.ts`). Rig
  the new mesh (Mixamo, or the 3D tool's auto-rig), then give its clips
  those names, or retarget the Kenney animations onto it in Blender.
- **Height:** stand the model on the origin with feet at y = 0, facing +Z,
  about the same height as `public/models/people/character-tycoon.glb`, so
  it lines up with the staff and doors.
