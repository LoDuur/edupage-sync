import mark from "@lobehub/icons-static-svg/icons/nvidia-color.svg";

export function NvidiaLogo({ className }: { className?: string }) {
  return <img alt="NVIDIA" className={className} src={mark} />;
}
