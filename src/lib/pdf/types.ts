export type PdfPage = {
  pageNumber: number;
  text: string;
};

export type PdfParseResult = {
  pageCount: number;
  pages: PdfPage[];
};
