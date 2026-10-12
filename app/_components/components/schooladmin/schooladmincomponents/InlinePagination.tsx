"use client";

import Pagination from "@/app/_components/components/common/Pagination";

type Props = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
};

/** Thin alias kept for existing import sites — see app/_components/components/common/Pagination. */
export default function InlinePagination(props: Props) {
  return <Pagination {...props} />;
}
