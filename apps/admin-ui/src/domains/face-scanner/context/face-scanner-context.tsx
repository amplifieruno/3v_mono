/**
 * Face Scanner Context and Provider
 *
 * Provides access to the Face Scanner model throughout the component tree.
 * Can accept an external model via props or create one internally.
 */

import React, { createContext, useContext, useEffect, useRef } from 'react';
import type { FaceScannerStore } from '../model/face-scanner-model';
import { createFaceScannerModel } from '../model/face-scanner-model';

/**
 * Context type - holds the Zustand store
 */
interface FaceScannerContextValue {
  store: FaceScannerStore;
}

/**
 * React Context for Face Scanner
 */
const FaceScannerContext = createContext<FaceScannerContextValue | null>(null);

/**
 * Provider Props
 */
interface FaceScannerProviderProps {
  /**
   * Optional external model (Zustand store).
   * If not provided, a new model will be created internally.
   */
  model?: FaceScannerStore;

  /**
   * Callback fired when the model is created internally.
   * Not called if an external model is provided.
   */
  onModelCreated?: (store: FaceScannerStore) => void;

  /**
   * Children components
   */
  children: React.ReactNode;
}

/**
 * Face Scanner Provider Component
 *
 * Creates or accepts a Face Scanner model and provides it via context.
 * Handles initialization and cleanup.
 */
export function FaceScannerProvider({
  model: externalModel,
  onModelCreated,
  children
}: FaceScannerProviderProps) {
  // Create internal model if no external model provided
  const internalModelRef = useRef<FaceScannerStore | null>(null);

  if (!internalModelRef.current && !externalModel) {
    internalModelRef.current = createFaceScannerModel();
  }

  const store = externalModel || internalModelRef.current!;

  // Initialize model on mount
  useEffect(() => {
    const isExternalModel = !!externalModel;

    // Only initialize if it's an internal model
    if (!isExternalModel) {
      const state = store.getState();

      // Initialize if not already initialized
      if (!state.isInitialized && !state.isInitializing) {
        store.getState().initialize().catch(error => {
          console.error('Failed to initialize face scanner:', error);
        });
      }

      // Call onModelCreated callback if provided
      if (onModelCreated && internalModelRef.current) {
        onModelCreated(internalModelRef.current);
      }
    }

    // Cleanup on unmount (only for internal model)
    return () => {
      if (!isExternalModel && internalModelRef.current) {
        internalModelRef.current.getState().cleanup();
      }
    };
  }, [externalModel, onModelCreated, store]);

  const contextValue: FaceScannerContextValue = {
    store
  };

  return (
    <FaceScannerContext.Provider value={contextValue}>
      {children}
    </FaceScannerContext.Provider>
  );
}

/**
 * Hook to access the Face Scanner model from context
 *
 * @throws Error if used outside of FaceScannerProvider
 */
export function useFaceScannerModel() {
  const context = useContext(FaceScannerContext);

  if (!context) {
    throw new Error('useFaceScannerModel must be used within a FaceScannerProvider');
  }

  return context.store;
}

/**
 * Hook to access specific state from the Face Scanner model
 * This is a convenience hook that uses Zustand's selector
 */
export function useFaceScannerState<T>(
  selector: (state: ReturnType<FaceScannerStore['getState']>) => T
): T {
  const store = useFaceScannerModel();
  return store(selector);
}
