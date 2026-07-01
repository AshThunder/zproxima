interface IconProps {
  name: string;
  size?: number;
  color?: string;
  fill?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function Icon({ name, size = 20, color, fill, className, style }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined${className ? ` ${className}` : ''}`}
      style={{
        fontSize: size,
        color,
        lineHeight: 1,
        fontVariationSettings: fill ? "'FILL' 1" : "'FILL' 0",
        ...style,
      }}
      aria-hidden
    >
      {name}
    </span>
  );
}
