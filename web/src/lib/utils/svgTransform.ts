import { LayerStyle, OutputMode } from '@/types/makerPresets';

/**
 * Apply style transformations to an SVG string
 */
export function applyStylesToSvg(
  svg: string,
  style: LayerStyle,
  outputMode: OutputMode
): string {
  // Compute effective stroke and fill based on output mode
  let effectiveStroke = style.stroke;
  let effectiveFill = style.fill;

  if (outputMode === 'stroke-only') {
    effectiveFill = 'none';
  } else if (outputMode === 'filled') {
    effectiveStroke = 'none';
  }

  // Create style attributes
  const strokeAttr = effectiveStroke !== 'none' ? `stroke="${effectiveStroke}"` : 'stroke="none"';
  const fillAttr = effectiveFill !== 'none' ? `fill="${effectiveFill}"` : 'fill="none"';
  const opacityAttr = style.opacity < 1 ? `opacity="${style.opacity}"` : '';
  const strokeWidthAttr = style.strokeWidth !== 1 ? `stroke-width-multiplier="${style.strokeWidth}"` : '';

  // Parse and transform SVG
  let transformed = svg;

  // Replace/add stroke attribute
  if (effectiveStroke !== 'none') {
    transformed = replaceOrAddAttribute(transformed, 'stroke', effectiveStroke);
  } else {
    transformed = replaceOrAddAttribute(transformed, 'stroke', 'none');
  }

  // Replace/add fill attribute
  if (effectiveFill !== 'none') {
    transformed = replaceOrAddAttribute(transformed, 'fill', effectiveFill);
  } else {
    transformed = replaceOrAddAttribute(transformed, 'fill', 'none');
  }

  // Apply opacity if not 100%
  if (style.opacity < 1) {
    transformed = applyOpacity(transformed, style.opacity);
  }

  // Apply stroke width multiplier
  if (style.strokeWidth !== 1) {
    transformed = applyStrokeWidthMultiplier(transformed, style.strokeWidth);
  }

  return transformed;
}

/**
 * Replace or add an attribute on the root SVG element
 */
function replaceOrAddAttribute(svg: string, attr: string, value: string): string {
  // Match the opening SVG tag
  const svgTagMatch = svg.match(/<svg([^>]*)>/i);
  if (!svgTagMatch) return svg;

  const svgTag = svgTagMatch[0];
  const svgAttrs = svgTagMatch[1];

  // Check if attribute exists
  const attrRegex = new RegExp(`${attr}\\s*=\\s*["'][^"']*["']`, 'gi');

  if (attrRegex.test(svgAttrs)) {
    // Replace existing attribute
    const newAttrs = svgAttrs.replace(attrRegex, `${attr}="${value}"`);
    return svg.replace(svgTag, `<svg${newAttrs}>`);
  } else {
    // Add new attribute
    return svg.replace(svgTag, `<svg ${attr}="${value}"${svgAttrs}>`);
  }
}

/**
 * Apply opacity to all elements in the SVG
 */
function applyOpacity(svg: string, opacity: number): string {
  // Add opacity to root SVG
  return replaceOrAddAttribute(svg, 'opacity', opacity.toString());
}

/**
 * Apply stroke width multiplier to all stroke-width attributes
 */
function applyStrokeWidthMultiplier(svg: string, multiplier: number): string {
  // Match stroke-width attributes with numeric values
  return svg.replace(
    /stroke-width\s*=\s*["']([0-9.]+)["']/gi,
    (match, width) => {
      const newWidth = parseFloat(width) * multiplier;
      return `stroke-width="${newWidth.toFixed(3)}"`;
    }
  );
}

/**
 * Extract SVG content (inner elements) from full SVG string
 */
export function extractSvgContent(svg: string): string {
  const content = svg
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');
  const match = content.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return match ? match[1] : content;
}

/**
 * Get SVG viewBox dimensions
 */
export function getSvgDimensions(svg: string): { width: number; height: number } | null {
  const viewBoxMatch = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBoxMatch) {
    const [, , w, h] = viewBoxMatch[1].split(/\s+/).map(Number);
    if (!isNaN(w) && !isNaN(h)) {
      return { width: w, height: h };
    }
  }

  const widthMatch = svg.match(/width\s*=\s*["']([0-9.]+)["']/i);
  const heightMatch = svg.match(/height\s*=\s*["']([0-9.]+)["']/i);

  if (widthMatch && heightMatch) {
    return {
      width: parseFloat(widthMatch[1]),
      height: parseFloat(heightMatch[1]),
    };
  }

  return null;
}

/**
 * Apply styles to SVG content for preview rendering
 * This version wraps content in a group with styles applied
 */
export function wrapContentWithStyles(
  content: string,
  style: LayerStyle,
  outputMode: OutputMode
): string {
  let effectiveStroke = style.stroke;
  let effectiveFill = style.fill;

  if (outputMode === 'stroke-only') {
    effectiveFill = 'none';
  } else if (outputMode === 'filled') {
    effectiveStroke = 'none';
  }

  const attrs: string[] = [];

  if (effectiveStroke !== 'none') {
    attrs.push(`stroke="${effectiveStroke}"`);
  } else {
    attrs.push('stroke="none"');
  }

  if (effectiveFill !== 'none') {
    attrs.push(`fill="${effectiveFill}"`);
  } else {
    attrs.push('fill="none"');
  }

  if (style.opacity < 1) {
    attrs.push(`opacity="${style.opacity}"`);
  }

  // Note: stroke-width multiplier needs special handling per element
  // For now, we apply it as a transform scale (approximate)

  return `<g ${attrs.join(' ')}>${content}</g>`;
}

/**
 * Transform a full SVG with layer styles for export
 */
export function transformSvgForExport(
  svg: string,
  style: LayerStyle,
  outputMode: OutputMode
): string {
  let transformed = svg;

  // Compute effective values
  let effectiveStroke = style.stroke;
  let effectiveFill = style.fill;

  if (outputMode === 'stroke-only') {
    effectiveFill = 'none';
  } else if (outputMode === 'filled') {
    effectiveStroke = 'none';
  }

  // Apply stroke color
  transformed = transformed.replace(
    /stroke\s*=\s*["'](?!none)[^"']*["']/gi,
    `stroke="${effectiveStroke}"`
  );

  // If original had stroke="none" and we want stroke, we need to add it
  // But this is complex - for now, we'll handle common cases

  // Apply fill color
  transformed = transformed.replace(
    /fill\s*=\s*["'](?!none)[^"']*["']/gi,
    `fill="${effectiveFill}"`
  );

  // Handle stroke="none" and fill="none" cases
  if (effectiveStroke === 'none') {
    transformed = transformed.replace(
      /stroke\s*=\s*["'][^"']+["']/gi,
      'stroke="none"'
    );
  }

  if (effectiveFill === 'none') {
    transformed = transformed.replace(
      /fill\s*=\s*["'][^"']+["']/gi,
      'fill="none"'
    );
  }

  // Apply stroke width multiplier
  if (style.strokeWidth !== 1) {
    transformed = applyStrokeWidthMultiplier(transformed, style.strokeWidth);
  }

  // Apply opacity - add to root SVG
  if (style.opacity < 1) {
    const svgMatch = transformed.match(/<svg([^>]*)>/i);
    if (svgMatch) {
      const hasOpacity = /opacity\s*=/i.test(svgMatch[1]);
      if (hasOpacity) {
        transformed = transformed.replace(
          /opacity\s*=\s*["'][^"']*["']/i,
          `opacity="${style.opacity}"`
        );
      } else {
        transformed = transformed.replace(
          /<svg/i,
          `<svg opacity="${style.opacity}"`
        );
      }
    }
  }

  return transformed;
}
