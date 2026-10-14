"use client";

import Spinner from "../../common/Spinner";

export default function LoadingSpinner(
  props: React.ComponentProps<typeof Spinner>
) {
  return <Spinner {...props} />;
}
