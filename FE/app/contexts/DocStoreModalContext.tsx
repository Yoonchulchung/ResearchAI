"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface DocStoreModalContextValue {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const DocStoreModalContext = createContext<DocStoreModalContextValue>({
  isOpen: false,
  openModal: () => {},
  closeModal: () => {},
});

export function DocStoreModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  return (
    <DocStoreModalContext.Provider value={{ isOpen, openModal, closeModal }}>
      {children}
    </DocStoreModalContext.Provider>
  );
}

export function useDocStoreModal() {
  return useContext(DocStoreModalContext);
}
