type BrandLogoProps = {
  isbrandLogoWhite?: boolean;
  size?: "navbar" | "auth";
};

export default function BrandLogo({
  isbrandLogoWhite = true,
  size = "navbar",
}: BrandLogoProps) {
  return (
    <img
      src={
        isbrandLogoWhite
          ? "/whitetimellylogo.png"
          : "/blacktimellylogo.png"
      }
      alt="Timelly"
      className={`object-contain ${size === "auth"
          ? "h-50 w-auto"
          : "h-50 w-auto"
        }`}
    />
  );
}
