declare module "html2canvas-pro" {
  export interface Html2CanvasOptions {
    scale?: number;
    useCORS?: boolean;
    allowTaint?: boolean;
    logging?: boolean;
    backgroundColor?: string | null;
    onclone?: (clonedDoc: Document, clonedElement: HTMLElement) => void;
    [key: string]: unknown;
  }

  export default function html2canvas(
    element: HTMLElement,
    options?: Html2CanvasOptions
  ): Promise<HTMLCanvasElement>;
}
