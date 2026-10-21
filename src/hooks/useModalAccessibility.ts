import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, View } from 'react-native';

/**
 * A11Y-04: standard modal accessibility. Attach the returned ref to the modal's
 * content container together with `accessibilityViewIsModal`, which stops screen
 * readers from escaping into background content. On iOS the container takes the
 * initial accessibility focus when the modal opens; when it closes, UIKit returns
 * focus to the presenting element. Android's native modal window owns focus
 * trapping and restoration, so the hook is a no-op there.
 */
export function useModalAccessibility(visible: boolean) {
  const containerRef = useRef<View>(null);

  useEffect(() => {
    if (!visible || Platform.OS !== 'ios') return;
    const node = containerRef.current;
    if (!node) return;
    const tag = findNodeHandle(node);
    if (tag != null) {
      AccessibilityInfo.setAccessibilityFocus(tag);
    }
  }, [visible]);

  return containerRef;
}
