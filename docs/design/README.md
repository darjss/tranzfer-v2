# Landing design references

Two hero comps for the tranzfer v2 landing page. Same product, different jobs.

| File                                                 | Role                         |
| ---------------------------------------------------- | ---------------------------- |
| [`hero-dark-brand.png`](./hero-dark-brand.png)       | Brand / core color vibe      |
| [`hero-light-product.png`](./hero-light-product.png) | Product direction and layout |

## Decision

**Ship the dark look.** Black ground, white condensed type, lime accent (`~#DFFF00` range). Feels like an edit bay, not a generic SaaS cream page. Logo, CTA, progress, and focus states should live in that palette.

**Steal the product layout from the light comp.** Do not ship the light cream/serif skin. Use it as the checklist for what the hero and below-the-fold must _show_:

- Real transfer UI in the hero (drop zone, project name, multi-card file list with GB sizes)
- Resume / connection-drop signal mid-upload
- Secure link ready state (short URL, expiry)
- Concrete CTA copy (e.g. free tier sized in GB), not only "Start a transfer"
- Feature row for pricing clarity, editor-friendly links, temporary storage

## How to combine

1. Keep dark cinematic framing from `hero-dark-brand.png` (timeline chrome, LOG metadata, coastal plate as footage, not as a soft stock background).
2. Rebuild the floating cards from `hero-light-product.png` in that dark system: lime progress, charcoal panels, monospace transfer stats.
3. Bottom band can keep the dark progress strip _or_ become a three-tile feature row; either way the light comps three promises (flat pricing, no client account, storage that expires) should appear on the page.

## Out of scope here

Cream + terracotta Codex variants and the shipping-tag blue collage stay out of this folder. Brand direction is dark + lime only.
