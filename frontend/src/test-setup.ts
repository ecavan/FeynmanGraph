import "@testing-library/jest-dom";

// jsdom polyfills for react-flow (canvas tests).
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverMock;

class DOMMatrixReadOnlyMock {
  m22 = 1;
  constructor(_t?: string) {}
  inverse() {
    return this;
  }
  multiply() {
    return this;
  }
}
(globalThis as { DOMMatrixReadOnly?: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnlyMock;

if (typeof window !== "undefined") {
  Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 800,
  });
}
