import { useCallback, useRef, useState } from "react";

const EMPTY_STATE = { open: false, options: {} };

export function useConfirm() {
  const [state, setState] = useState(EMPTY_STATE);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, options: options ?? {} });
    });
  }, []);

  const settle = useCallback((result) => {
    setState(EMPTY_STATE);

    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
  }, []);

  const dialogProps = {
    open: state.open,
    ...state.options,
    onConfirm: () => settle(true),
    onCancel: () => settle(false)
  };

  return { confirm, dialogProps };
}
