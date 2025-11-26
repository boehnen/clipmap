// backend/src/queue/exportQueue.ts
// Queue system for managing concurrent export requests
import { logger } from "../logger";

interface QueuedRequest {
  id: string;
  requestId: string; // Unique ID for tracking this specific request
  bbox: any;
  layers: string[];
  startTime: number;
  position: number;
  clientIp?: string; // Client IP address
  // Optional callback to notify client of position changes
  onPositionChange?: (position: number) => void;
}

class ExportQueue {
  private queue: QueuedRequest[] = [];
  private processing: QueuedRequest | null = null;
  private requestIdCounter = 0;

  /**
   * Check if an IP address already has a request in the queue
   */
  hasRequestFromIp(clientIp: string): boolean {
    // Check if currently processing
    if (this.processing?.clientIp === clientIp) {
      return true;
    }
    
    // Check if in queue
    return this.queue.some(q => q.clientIp === clientIp);
  }

  /**
   * Add a request to the queue
   * @param requestId Unique identifier for this request
   * @param bbox Bounding box
   * @param layers Layers to export
   * @param clientIp Client IP address (optional, for preventing multiple requests)
   * @param onPositionChange Optional callback to notify when position changes
   * @returns Queue position (0 = currently processing, 1 = next, etc.)
   */
  enqueue(
    requestId: string,
    bbox: any,
    layers: string[],
    clientIp?: string,
    onPositionChange?: (position: number) => void
  ): number {
    const id = `req-${++this.requestIdCounter}-${Date.now()}`;
    
    const queued: QueuedRequest = {
      id,
      requestId,
      bbox,
      layers,
      startTime: Date.now(),
      position: 0, // Will be updated below
      clientIp,
      onPositionChange,
    };
    
    // Add to queue first
    this.queue.push(queued);
    
    // Calculate and update position
    this.updatePositions();
    const position = queued.position;
    
    logger.info("queue_enqueued", {
      requestId,
      position,
      queueLength: this.queue.length,
      isProcessing: !!this.processing,
    });
    
    return position;
  }

  /**
   * Get the next request from the queue
   * This is atomic - only one request can be processing at a time
   */
  dequeue(): QueuedRequest | null {
    // Critical: Check and set processing atomically
    if (this.processing) {
      return null; // Already processing
    }
    
    // Get next from queue
    const next = this.queue.shift();
    if (!next) {
      return null; // Queue is empty
    }
    
    // Set processing BEFORE returning (atomic operation)
    this.processing = next;
    
    // Update positions for remaining items and notify them
    this.updatePositions();
    
    return next;
  }
  
  /**
   * Check if a specific request is currently processing
   */
  isProcessing(requestId: string): boolean {
    return this.processing?.requestId === requestId;
  }

  /**
   * Mark current request as complete and process next
   * This automatically allows the next request in the queue to start
   */
  complete(): void {
    const wasProcessing = this.processing?.requestId;
    this.processing = null;
    
    logger.info("queue_complete", {
      wasProcessing,
      queueLength: this.queue.length,
    });
    
    // Update positions - this will notify waiting clients
    this.updatePositions();
  }

  /**
   * Remove a request from the queue (e.g., if client disconnects)
   * IMPORTANT: If the request is currently processing, we do NOT remove it.
   * It will continue processing until it naturally completes.
   */
  remove(requestId: string): boolean {
    // If currently processing, don't remove - let it finish
    if (this.processing?.requestId === requestId) {
      logger.info("queue_processing_request_cancelled", { requestId });
      return false; // Not removed from processing
    }
    
    // Remove from queue
    const index = this.queue.findIndex(q => q.requestId === requestId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.updatePositions(); // Update positions and notify others
      logger.info("queue_request_removed", {
        requestId,
        wasAtPosition: this.queue[index]?.position || null,
        queueLength: this.queue.length,
      });
      return true;
    }
    
    return false;
  }

  /**
   * Get current queue status
   */
  getStatus(): {
    queueLength: number;
    isProcessing: boolean;
    processingId: string | null;
  } {
    return {
      queueLength: this.queue.length,
      isProcessing: !!this.processing,
      processingId: this.processing?.id || null,
    };
  }

  /**
   * Get position of a request in the queue by requestId
   */
  getPosition(requestId: string): number | null {
    // Check if currently processing
    if (this.processing?.requestId === requestId) {
      return 0; // Currently processing
    }
    
    // Check if in queue
    const index = this.queue.findIndex(q => q.requestId === requestId);
    if (index !== -1) {
      return this.queue[index].position;
    }
    
    return null; // Not found
  }
  
  /**
   * Get queued request by requestId
   */
  getByRequestId(requestId: string): QueuedRequest | null {
    if (this.processing?.requestId === requestId) {
      return this.processing;
    }
    
    return this.queue.find(q => q.requestId === requestId) || null;
  }

  /**
   * Update positions for all queued items and notify clients
   */
  private updatePositions(): void {
    this.queue.forEach((item, index) => {
      const oldPosition = item.position;
      
      // Calculate new position
      if (this.processing) {
        // Something is processing, so queue items are positions 1, 2, 3...
        item.position = index + 1;
      } else {
        // Nothing is processing, so first item is position 0, rest are 1, 2, 3...
        item.position = index;
      }
      
      // Notify client if position changed
      if (oldPosition !== item.position && item.onPositionChange) {
        try {
          item.onPositionChange(item.position);
        } catch (err) {
          // Client callback failed - remove callback to avoid future errors
          logger.warn("queue_position_callback_failed", {
            requestId: item.requestId,
            error: err instanceof Error ? err.message : String(err),
          });
          item.onPositionChange = undefined;
        }
      }
    });
  }

  /**
   * Get queue length
   */
  getLength(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0 && !this.processing;
  }
}

// Singleton instance
export const exportQueue = new ExportQueue();