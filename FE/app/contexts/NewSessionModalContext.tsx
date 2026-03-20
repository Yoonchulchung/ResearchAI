"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface NewSessionModalContextValue {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const NewSessionModalContext = createContext<NewSessionModalContextValue>({
  isOpen: false,
  openModal: () => {},
  closeModal: () => {},
});

export function NewSessionModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  return (
    <NewSessionModalContext.Provider value={{ isOpen, openModal, closeModal }}>
      {children}
    </NewSessionModalContext.Provider>
  );
}

export function useNewSessionModal() {
  return useContext(NewSessionModalContext);
}
