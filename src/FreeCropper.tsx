import { useRef, useState, type PointerEvent } from 'react';
import type { Area } from 'react-easy-crop';
import './FreeCropper.css';

const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = typeof handles[number] | 'move';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type Props = {
  src: string;
  area: Area | null;
  onChange: (area: Area) => void;
  disabled: boolean;
};

export default function FreeCropper({ src, area, onChange, disabled }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const drag = useRef<{ id: number; handle: Handle; x: number; y: number; area: Area } | null>(null);

  const startDrag = (event: PointerEvent<HTMLDivElement>, handle: Handle) => {
    if (disabled || !area || drag.current || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, handle, x: event.clientX, y: event.clientY, area };
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (disabled || !start || start.id !== event.pointerId || !size || !imageRef.current) return;

    const bounds = imageRef.current.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dx = Math.round((event.clientX - start.x) * size.width / bounds.width);
    const dy = Math.round((event.clientY - start.y) * size.height / bounds.height);
    const { x, y, width, height } = start.area;

    if (start.handle === 'move') {
      onChange({
        x: clamp(x + dx, 0, size.width - width),
        y: clamp(y + dy, 0, size.height - height),
        width,
        height,
      });
      return;
    }

    // Keep enough room to grab the frame between its resize handles.
    const minWidth = Math.min(width, Math.ceil(28 * size.width / bounds.width));
    const minHeight = Math.min(height, Math.ceil(28 * size.height / bounds.height));
    const right = x + width;
    const bottom = y + height;
    const leftEdge = start.handle.includes('w') ? clamp(x + dx, 0, right - minWidth) : x;
    const topEdge = start.handle.includes('n') ? clamp(y + dy, 0, bottom - minHeight) : y;
    const rightEdge = start.handle.includes('e') ? clamp(right + dx, x + minWidth, size.width) : right;
    const bottomEdge = start.handle.includes('s') ? clamp(bottom + dy, y + minHeight, size.height) : bottom;
    onChange({ x: leftEdge, y: topEdge, width: rightEdge - leftEdge, height: bottomEdge - topEdge });
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  return (
    <div className="free-cropper">
      <div className="free-cropper-image">
        <img
          ref={imageRef}
          src={src}
          alt="자유 편집할 이미지"
          draggable={false}
          onLoad={({ currentTarget }) => {
            const width = currentTarget.naturalWidth;
            const height = currentTarget.naturalHeight;
            setSize({ width, height });
            if (!area) {
              const x = Math.floor(width / 10);
              const y = Math.floor(height / 10);
              onChange({ x, y, width: width - 2 * x, height: height - 2 * y });
            }
          }}
        />
        {size && area && (
          <div
            className="free-cropper-frame"
            style={{
              left: `${area.x / size.width * 100}%`,
              top: `${area.y / size.height * 100}%`,
              width: `${area.width / size.width * 100}%`,
              height: `${area.height / size.height * 100}%`,
            }}
            onPointerDown={(event) => startDrag(event, 'move')}
            onPointerMove={moveDrag}
            onPointerUp={(event) => { moveDrag(event); endDrag(event); }}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          >
            {handles.map((handle) => (
              <div
                key={handle}
                className={`free-cropper-handle free-cropper-handle-${handle}`}
                onPointerDown={(event) => startDrag(event, handle)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
