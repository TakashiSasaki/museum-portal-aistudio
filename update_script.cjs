const fs = require('fs');

const indexPath = 'public/index.js';
let content = fs.readFileSync(indexPath, 'utf-8');

// Replace the part that applies theme.text to the whole `existingLink` (the `<a>` element).
// We'll change it so it applies `text-white` to the `span` element containing the title.
// Actually, if the title must be white, the `existingLink` shouldn't get the theme text color.
// Wait, if we just remove the existingLink.classList.add(theme.text), what color will the glow be?
// The glow uses `currentColor`. So we *want* the `plasma-sphere` to have `theme.text` for `currentColor` to work for box-shadow.
// The `span` (title) should be strictly `text-white` or `text-slate-200`.

const newContent = content.replace(
`                    // Replace existing text-* class on main <a> element (excluding generic ones like text-center)
                    const textClasses = Array.from(existingLink.classList).filter(c => c.startsWith('text-') && !['text-center', 'text-left', 'text-right', 'text-justify'].includes(c));
                    existingLink.classList.remove(...textClasses, 'default-text-color');
                    existingLink.classList.add(theme.text);`,
`                    // Remove default-text-color to show data is loaded
                    existingLink.classList.remove('default-text-color');

                    // Apply theme text color to the plasma sphere to ensure currentColor glow works properly
                    if (iconContainer) {
                        const iconTextClasses = Array.from(iconContainer.classList).filter(c => c.startsWith('text-') && !['text-center'].includes(c));
                        iconContainer.classList.remove(...iconTextClasses);
                        iconContainer.classList.add(theme.text);
                    }

                    // Ensure title text remains white/slate-200
                    const spanElement = existingLink.querySelector('span');
                    if (spanElement) {
                        spanElement.classList.remove('text-slate-500'); // If there were any fallback
                        spanElement.classList.add('text-slate-200'); // Explicitly set to light color
                    }`
);

fs.writeFileSync(indexPath, newContent);
