"use client";

import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { ReactNode, useState } from "react";

// Node 2.C.2 — ConfirmDialog.
//
// Two-step confirmation modal for destructive / dangerous actions. Used
// by:
//   - halt trading           (confirmColor="danger")
//   - approve recommendation (confirmColor="primary")
//   - delete strategy        (confirmColor="danger")
//   - mainnet confirm        (confirmColor="warning")
//
// Controlled by `open` + `onOpenChange`. While `onConfirm` returns a
// Promise the confirm button shows a loading state; if it throws, the
// dialog stays open so the caller can re-render with a re-tryable error
// message in `message`.

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  confirmColor?: "danger" | "warning" | "primary";
  /** Callback when user clicks confirm. Can be async — dialog shows a
   * loading state while it resolves and closes on success. */
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmColor = "primary",
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      // Caller is responsible for surfacing the error (toast / inline).
      // We keep the dialog open so the user can retry / cancel.
      console.error("ConfirmDialog onConfirm error:", err);
    } finally {
      setBusy(false);
    }
  };

  // Stable ids so the modal header / body can wire aria-labelledby /
  // aria-describedby for screen readers. We use deterministic ids
  // (suffixed by React's useId is unnecessary here — only one
  // ConfirmDialog is open at a time per app).
  const titleId = "confirm-dialog-title";
  const messageId = "confirm-dialog-message";

  return (
    <Modal
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      placement="center"
      aria-labelledby={titleId}
      aria-describedby={message ? messageId : undefined}
    >
      <ModalContent>
        <ModalHeader id={titleId} className="text-text-primary">{title}</ModalHeader>
        {message && (
          <ModalBody id={messageId} className="text-text-secondary text-sm">
            {message}
          </ModalBody>
        )}
        <ModalFooter>
          <Button
            variant="flat"
            onPress={() => onOpenChange(false)}
            isDisabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            color={confirmColor}
            onPress={handleConfirm}
            isLoading={busy}
          >
            {confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
