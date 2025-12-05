import React, { SyntheticEvent } from 'react';
import { Resizable, ResizeCallbackData } from 'react-resizable';
import './ResizableTitle.css'; // We might need to add this or use inline styles

interface ResizableTitleProps {
  onResize: (e: SyntheticEvent, data: ResizeCallbackData) => void;
  width: number;
  children: React.ReactNode;
}

const ResizableTitle: React.FC<ResizableTitleProps> = (props) => {
  const { onResize, width, ...restProps } = props;

  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => {
            e.stopPropagation();
          }}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

export default ResizableTitle;
