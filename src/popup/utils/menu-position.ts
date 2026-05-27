export type MenuPosition = {
  left: number;
  top: number;
};

export type MenuViewportRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function clampMenuPosition(
  preferredLeft: number,
  preferredTop: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 8,
): MenuPosition {
  const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
  const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);

  return {
    left: Math.min(Math.max(preferredLeft, margin), maxLeft),
    top: Math.min(Math.max(preferredTop, margin), maxTop),
  };
}

export function adjustMenuRectToViewport(
  rect: MenuViewportRect,
  viewportWidth: number,
  viewportHeight: number,
  margin = 8,
): MenuPosition {
  let left = rect.left;
  let top = rect.top;

  if (rect.right > viewportWidth - margin) {
    left -= rect.right - (viewportWidth - margin);
  }
  if (rect.left < margin) {
    left += margin - rect.left;
  }
  if (rect.bottom > viewportHeight - margin) {
    top -= rect.bottom - (viewportHeight - margin);
  }
  if (rect.top < margin) {
    top += margin - rect.top;
  }

  return clampMenuPosition(left, top, rect.width, rect.height, viewportWidth, viewportHeight, margin);
}
