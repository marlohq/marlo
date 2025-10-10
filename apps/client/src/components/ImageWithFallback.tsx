import { useState } from 'react';

export function ImageWithFallback({
	src,
	alt,
	fallback,
	forceFallback,
	...rest
}: {
	src: string | undefined;
	alt: string;
	fallback: React.ReactNode;
	forceFallback?: boolean;
} & React.ImgHTMLAttributes<HTMLImageElement>) {
	const [hasError, setHasError] = useState(false);
	if (!src || hasError || forceFallback) {
		return fallback;
	}
	return (
		<img
			{...rest}
			src={src}
			alt={alt}
			onError={() => {
				setHasError(true);
			}}
		/>
	);
}
