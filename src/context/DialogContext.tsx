import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface NotifyOptions {
  title: string;
  message: string;
  buttonLabel?: string;
}

export interface DialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (options: NotifyOptions) => Promise<void>;
}

const defaultDialogValue: DialogContextValue = {
  confirm: async () => false,
  notify: async () => {},
};

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext);
  return context || defaultDialogValue;
}

interface DialogState {
  type: 'confirm' | 'notify';
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (value: any) => void;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [currentDialog, setCurrentDialog] = useState<DialogState | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setCurrentDialog({
        type: 'confirm',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        destructive: Boolean(options.destructive),
        resolve,
      });
    });
  }, []);

  const notify = useCallback((options: NotifyOptions): Promise<void> => {
    return new Promise<void>((resolve) => {
      setCurrentDialog({
        type: 'notify',
        title: options.title,
        message: options.message,
        confirmLabel: options.buttonLabel || 'OK',
        cancelLabel: '',
        destructive: false,
        resolve,
      });
    });
  }, []);

  const handleClose = (result: boolean) => {
    if (currentDialog) {
      currentDialog.resolve(result);
      setCurrentDialog(null);
    }
  };

  return (
    <DialogContext.Provider value={{ confirm, notify }}>
      {children}
      {currentDialog && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={() => handleClose(false)}
        >
          <SafeAreaView style={styles.overlay}>
            <View
              style={styles.container}
              accessible={true}
              accessibilityRole="alert"
              accessibilityLabel={currentDialog.title}
            >
              <Text style={styles.title}>{currentDialog.title}</Text>
              <Text style={styles.message}>{currentDialog.message}</Text>
              <View style={styles.buttonRow}>
                {currentDialog.type === 'confirm' && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => handleClose(false)}
                    accessibilityRole="button"
                    accessibilityLabel={currentDialog.cancelLabel}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelText}>{currentDialog.cancelLabel}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.confirmBtn,
                    currentDialog.destructive ? styles.destructiveBtn : styles.primaryBtn,
                  ]}
                  onPress={() => handleClose(true)}
                  accessibilityRole="button"
                  accessibilityLabel={currentDialog.confirmLabel}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.confirmText,
                      currentDialog.destructive ? styles.destructiveText : styles.primaryText,
                    ]}
                  >
                    {currentDialog.confirmLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#181A20',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#262A34',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#262A34',
  },
  cancelText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#3B82F6',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  destructiveBtn: {
    backgroundColor: '#EF4444',
  },
  destructiveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
