---
name: caro-mockup-gen
description: >
  Specialized skill for generating production-ready streetwear mockups for CARO Clothing.
  Encodes the brand's industrial, high-contrast, and Sri Lankan Gen Z aesthetic.
  Use when the user provides graphics and wants to see them on a garment (hanger or model).
---

# CARO Mockup Generation Skill

This skill transforms simple requests into high-fidelity image generation prompts that align with CARO's visual DNA.

## 🧬 Visual DNA (Extracted Properties)

- **Vibe:** Raw, Industrial, Underground, Sri Lankan Gen Z Streetwear.
- **Tone:** High contrast, cool-neutral grading, slightly desaturated, moody.
- **Lighting:** Dramatic top-lighting (industrial), diffused studio-key (model), or harsh overhead (alleyway).
- **Backgrounds:** Dark textured concrete, industrial pipes, urban alleys with graffiti, or neutral grey studio with subtle floor reflections.
- **Garment:** Heavyweight 300gsm cotton, oversized boxy fit, drop shoulders, substantial drape.
- **Models:** Confident, grounded Sri Lankan Gen Z aesthetic. No smiling, urban styling (cargo pants, silver chains, sunglasses).
- **Colors:** Void (#0A0A0A), Charcoal (#1C1C1C), Bone (#F8F5F0), Volt (#C8FF00 - accent only).

---

## 🛠 Prompt Construction Logic

When a user asks for a mockup, follow this template structure:

### 1. PRODUCT (Hanger/Flat Lay)

**Template:** `product photography, [GARMENT] hanging on an industrial black iron pipe hanger, centered, [BACKGROUND], [LIGHTING], high contrast, 8k resolution, visible fabric texture`

- **Garment:** "oversized heavyweight [color] cotton tee, boxy drop-shoulder silhouette"
- **Background:** "dark textured concrete wall with subtle imperfections"
- **Lighting:** "dramatic top-down lighting creating deep shadows and revealing fabric grain"

### 2. MODEL (Editorial/Studio)

**Template:** `editorial streetwear photography, [MODEL_DESC] wearing an oversized heavyweight [color] cotton tee, [POSE], [LOCATION], [LIGHTING], [FILM_STYLE]`

- **Model:** "young Sri Lankan model, confident neutral expression, urban streetwear styling, silver chain"
- **Location:** "industrial concrete loading dock" or "urban alleyway with weathered walls"
- **Film Style:** "shot on 35mm film, cool-neutral grade, high contrast, rich blacks"

---

## 🚀 Production Ready Prompts (Ready to Copy)

### Scenario A: Black T-shirt on Hanger (Industrial)

> **Prompt:** `Professional product photography of a heavyweight 300gsm black oversized cotton t-shirt, boxy drop-shoulder fit, hanging on a weathered industrial black iron pipe bracket. Background is a dark, raw textured concrete wall with subtle moisture streaks and cracks. Dramatic top-down studio lighting, high contrast, cool-neutral color grade. Visible fabric grain and natural heavy drape. --ar 1:1 --v 6 --style raw`

### Scenario B: Model in Studio (Clean Edgy)

> **Prompt:** `Studio lookbook photography of a young Sri Lankan male model with curly hair and a confident neutral expression, wearing an oversized heavyweight black t-shirt and charcoal cargo pants. Standing in a minimalist dark grey studio with a subtle floor reflection. Single diffused key light from the side creating deep shadows. High contrast, desaturated tones, premium streetwear aesthetic. --ar 4:5 --v 6 --style raw`

### Scenario C: Editorial (Alleyway B&W)

> **Prompt:** `Black and white film photography of a young Sri Lankan woman with a short buzzcut, leaning against a graffiti-covered concrete wall in a narrow urban alleyway. She is wearing a boxy oversized heavyweight white t-shirt. Raw, gritty atmosphere, heavy film grain, high contrast shadows. Shot on Ilford HP5 35mm. --ar 2:3 --v 6 --style raw`

---

## 🚫 Negative Prompt (Universal for CARO)

`warm tones, golden hour, smiling, plastic hanger, chrome, oversaturated, heavy bokeh, blurry background, hyperrealistic, 8k render, CGI, watermark, text, cute, soft lighting, corporate aesthetic`
