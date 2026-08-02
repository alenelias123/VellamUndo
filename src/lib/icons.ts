import type { LucideIcon } from "lucide-react";

/**
 * Standard icon scale used across the whole UI so every lucide icon
 * renders at a consistent visual weight regardless of context.
 *
 *   xs = tiny inline icons next to micro-text (badges, chips, stat rows)
 *   sm = default inline icon inside text / buttons / inputs
 *   md = standard icon in buttons, list rows and section labels
 *   lg = medium icon in card headers and controls
 *   xl = toolbar / rail icons
 *   xxl = large hero / empty-state icons
 */
export const iconSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24
} as const;

type IconNode = readonly [string, Record<string, string>, ...(IconNode | string)[]];

function serializeNode(node: IconNode | string): string {
  if (typeof node === "string") return node;
  const [tag, attrs, ...children] = node;
  const attrStr = Object.entries(attrs)
    .filter(([key]) => key !== "key")
    .map(([key, value]) => {
      const escaped = String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
      return `${key}="${escaped}"`;
    })
    .join(" ");
  if (children.length > 0) {
    return `<${tag} ${attrStr}>${children.map(serializeNode).join("")}</${tag}>`;
  }
  return `<${tag} ${attrStr}/>`;
}

type RenderableIcon = LucideIcon & {
  render: (props: object) => { props: { iconNode: IconNode[] } };
};

/**
 * Renders a lucide icon to an inline SVG string without going through
 * React DOM, so it can be embedded in Leaflet `divIcon` HTML and other
 * raw-HTML surfaces while keeping the exact same design as React icons.
 */
export function iconSvg(
  icon: LucideIcon,
  options: { size?: number; color?: string; strokeWidth?: number } = {}
): string {
  const { size = iconSizes.md, color = "currentColor", strokeWidth = 2 } = options;
  const renderable = icon as unknown as RenderableIcon;
  const element = renderable.render({ size, color, strokeWidth });
  const body = element.props.iconNode.map(serializeNode).join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    ` width="${size}" height="${size}" viewBox="0 0 24 24"`,
    ` fill="none" stroke="${color}" stroke-width="${strokeWidth}"`,
    ` stroke-linecap="round" stroke-linejoin="round"`,
    ` class="lucide">${body}</svg>`
  ].join("");
}
