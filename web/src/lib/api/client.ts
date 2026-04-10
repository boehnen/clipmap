const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface ExportProgress {
  step: string;
  progress: number;
  message?: string;
  file?: string;
  error?: string;
}

export interface ExportRequest {
  bbox: {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
  };
  layers: string[];
}

export interface LayerData {
  name: string;
  svg: string;
  width: number;
  height: number;
}

export interface LayerStreamCallbacks {
  onQueuePosition?: (position: number) => void;
  onStart?: (layers: string[]) => void;
  onLayerProgress?: (layer: string, status: 'fetching' | 'rendering') => void;
  onLayer?: (layer: LayerData) => void;
  onComplete?: (info: { layers: number; width: number; height: number }) => void;
  onError?: (error: string, layer?: string) => void;
}

const STEP_LABELS: Record<string, string> = {
  queued: 'Queued',
  starting: 'Starting',
  fetching_water: 'Fetching water data',
  fetching_land: 'Processing land',
  fetching_roads: 'Fetching roads',
  fetching_railways: 'Fetching railways',
  fetching_buildings: 'Fetching buildings',
  fetching_parks: 'Fetching parks',
  fetching_places: 'Fetching places',
  fetching_boundaries: 'Fetching boundaries',
  fetching_transit: 'Fetching transit',
  rendering: 'Rendering SVG',
  optimizing: 'Optimizing',
  packaging: 'Creating ZIP',
  complete: 'Complete',
};

export function getStepLabel(step: string): string {
  return STEP_LABELS[step] || step;
}

/**
 * Stream individual SVG layers from the server
 * Each layer is returned as it's generated, allowing real-time preview
 */
export async function streamLayers(
  request: ExportRequest,
  callbacks: LayerStreamCallbacks
): Promise<LayerData[]> {
  console.log('[streamLayers] Starting request:', request);

  const response = await fetch(`${API_BASE_URL}/export-layers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[streamLayers] Request failed:', response.status, errorText);
    throw new Error(`Export failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const layers: LayerData[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log('[streamLayers] Stream ended. Total layers received:', layers.length, layers.map(l => l.name));
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events (separated by double newlines)
    const eventSeparator = '\n\n';
    let eventEnd: number;

    while ((eventEnd = buffer.indexOf(eventSeparator)) !== -1) {
      const eventBlock = buffer.slice(0, eventEnd);
      buffer = buffer.slice(eventEnd + eventSeparator.length);

      // Parse the event block
      let eventType = '';
      let eventData = '';

      for (const line of eventBlock.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6);
        } else if (line.startsWith(':')) {
          // Comment/keepalive - ignore
        }
      }

      if (!eventType || !eventData) continue;

      try {
        const data = JSON.parse(eventData);
        console.log('[streamLayers] Event:', eventType, 'Keys:', Object.keys(data));

        switch (eventType) {
          case 'queue':
            callbacks.onQueuePosition?.(data.position);
            break;

          case 'start':
            console.log('[streamLayers] Start - layers:', data.layers);
            callbacks.onStart?.(data.layers);
            break;

          case 'progress':
            console.log('[streamLayers] Progress:', data.layer, data.status);
            callbacks.onLayerProgress?.(data.layer, data.status);
            break;

          case 'layer':
            console.log('[streamLayers] Layer received:', data.name, 'SVG length:', data.svg?.length);
            const layerData: LayerData = {
              name: data.name,
              svg: data.svg,
              width: data.width,
              height: data.height,
            };
            layers.push(layerData);
            callbacks.onLayer?.(layerData);
            break;

          case 'complete':
            console.log('[streamLayers] Complete:', data);
            callbacks.onComplete?.({
              layers: data.layers,
              width: data.width,
              height: data.height,
            });
            break;

          case 'error':
            console.error('[streamLayers] Error:', data);
            callbacks.onError?.(data.error, data.layer);
            break;
        }
      } catch (e) {
        console.warn('[streamLayers] Failed to parse JSON for event:', eventType, e);
      }
    }
  }

  return layers;
}

/**
 * Legacy export that returns a ZIP blob
 */
export async function exportMap(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void
): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/export-zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let zipData: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      try {
        const data = JSON.parse(line.slice(6));
        onProgress({
          step: data.step,
          progress: data.progress || 0,
          message: getStepLabel(data.step),
          error: data.error,
        });

        if (data.file) {
          zipData = data.file;
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  if (!zipData) {
    throw new Error('No file data received');
  }

  const binaryString = atob(zipData);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Blob([bytes], { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Create a ZIP file from layer data client-side
 */
export async function createZipFromLayers(layers: LayerData[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  for (const layer of layers) {
    zip.file(`${layer.name}.svg`, layer.svg);
  }

  return zip.generateAsync({ type: 'blob' });
}
