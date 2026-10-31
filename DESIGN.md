# StoreOps interface

Extend the existing dark operational interface. The user is an indie developer
making a store change, not an expert in store API terminology.

## Hierarchy and language
- Lead with the task and its next action. One primary action per stage.
- Use “US price,” “country prices,” “pricing goal,” and “price backups” in the UI.
  Keep API terms such as anchors, equalizations, grids, and snapshots in code or
  optional technical explanations.
- Never hide consequences, subscriber impacts, errors, or final confirmation.
- Put spreadsheet imports, uncommon settings, setup instructions, and backups
  behind native details/summary controls.

## Existing visual system
- Geist for interface text; Geist Mono and tabular figures for money and IDs.
- Zinc-950 canvas, zinc-900 inset surfaces, zinc-700/800 borders.
- Emerald marks selections, primary actions, and verified outcomes. Amber marks
  subscriber impact and review; red marks failed operations.
- Use the shared AppIcon line icons rather than decorative emoji.
- Use 4px spacing increments, 14px controls, and touch targets of at least 44px
  for new primary controls. Global focus indicators and reduced-motion support
  apply to all operational screens.

## Shared patterns
- AppTabs: four named tasks with a short explanation; two columns on phones.
- WorkflowSteps: plan selection → price selection → preview → results.
- PricingStrategyPicker: native radios with the entire visual option clickable.
- Desktop paired pricing: one comparison table. Phone paired pricing: one
  compact card per country, with monthly and yearly side by side.
- Real country names and currencies lead; store IDs remain secondary.
- Read live prices before applying; save both backups before the first write;
  report partial results per plan. A preview is never a store mutation.

## Browser verification
Reproducible isolated fixtures and checks live in scripts/browser-*.js. They
intercept every API request and use generated local signing keys. They do not
use real store credentials. Test at 1280px, 390px, and 320px; include failed reads,
stale previews, failed backup storage, and partial applies.
