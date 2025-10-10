import {
	RiBuilding4Line,
	RiFacebookBoxFill,
	RiGithubFill,
	RiGlobalLine,
	RiInstagramFill,
	RiLinkedinBoxFill,
	RiMapPinLine,
	RiPhoneLine,
	RiShareBoxLine,
	RiTwitterXFill,
	RiUserLine,
	RiYoutubeFill,
} from '@remixicon/react';
import { useQuery } from '@workspace/local/query.ts';
import { Popover, PopoverContent, PopoverTrigger } from '@workspace/ui';
import { useState } from 'react';
import { ImageWithFallback } from './ImageWithFallback.tsx';

function getSocialIcon(platform: string) {
	const platformLower = platform.toLowerCase();
	switch (platformLower) {
		case 'linkedin':
			return RiLinkedinBoxFill;
		case 'twitter':
		case 'x':
			return RiTwitterXFill;
		case 'github':
			return RiGithubFill;
		case 'instagram':
			return RiInstagramFill;
		case 'facebook':
			return RiFacebookBoxFill;
		case 'youtube':
			return RiYoutubeFill;
		default:
			return RiShareBoxLine;
	}
}

export function ContactProfilePopover({
	senderEmail,
	senderName,
	children,
}: {
	senderEmail: string;
	senderName?: string | null;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);

	const [contact] = useQuery(
		(db) => db.contacts.where('data.email').equals(senderEmail).first(),
		[senderEmail],
	);

	const profile = contact?.data.profile;
	const hasProfileInfo =
		profile &&
		(profile.title ||
			profile.company ||
			profile.location ||
			profile.phone_number ||
			profile.website ||
			profile.socialMedia?.length);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button type="button" className="text-inherit hover:text-inherit focus:outline-none">
					{children}
				</button>
			</PopoverTrigger>
			<PopoverContent className="z-50 w-64 p-0" side="bottom" align="start">
				{/* Header with avatar and name - White background */}
				<div className="flex items-center space-x-3 bg-white p-4">
					<div className="flex size-10 items-center justify-center overflow-hidden rounded bg-blue-500">
						<ImageWithFallback
							src={undefined}
							alt=""
							className="size-full"
							fallback={<RiUserLine className="size-5 text-white" />}
						/>
					</div>
					<div className="min-w-0 flex-1">
						<div className="truncate font-medium text-gray-900">{senderName || senderEmail}</div>
						{senderName && <div className="truncate text-sm text-gray-500">{senderEmail}</div>}
					</div>
				</div>

				{/* Profile information - Gray background */}
				<div className="border-t border-gray-100 bg-neutral-50 p-4">
					<div className="space-y-2">
						{hasProfileInfo ? (
							<>
								{profile?.title && (
									<div className="flex items-center space-x-2 text-sm">
										<RiUserLine className="size-4 flex-shrink-0 text-gray-600" />
										<span className="text-gray-600">{profile.title}</span>
									</div>
								)}

								{profile?.company && (
									<div className="flex items-center space-x-2 text-sm">
										<RiBuilding4Line className="size-4 flex-shrink-0 text-gray-600" />
										<span className="text-gray-600">{profile.company}</span>
									</div>
								)}

								{profile?.location && (
									<div className="flex items-center space-x-2 text-sm">
										<RiMapPinLine className="size-4 flex-shrink-0 text-gray-600" />
										<span className="text-gray-600">{profile.location}</span>
									</div>
								)}

								{profile?.phone_number && (
									<div className="flex items-center space-x-2 text-sm">
										<RiPhoneLine className="size-4 flex-shrink-0 text-gray-600" />
										<span className="text-gray-600">{profile.phone_number}</span>
									</div>
								)}

								{profile?.website && (
									<div className="flex items-center space-x-2 text-sm">
										<RiGlobalLine className="size-4 flex-shrink-0 text-gray-600" />
										<a
											href={profile.website}
											target="_blank"
											rel="noopener noreferrer"
											className="truncate text-blue-600 hover:underline"
										>
											{profile.website}
										</a>
									</div>
								)}
							</>
						) : (
							<div className="text-sm text-gray-500">
								No additional profile information available.
							</div>
						)}
					</div>

					{/* Social Media Icons - always at bottom if available */}
					{profile?.socialMedia && profile.socialMedia.length > 0 && (
						<div className="pt-3">
							<div className="flex flex-wrap gap-2">
								{profile.socialMedia.map(
									(social: { platform: string; url: string }, index: number) => {
										const IconComponent = getSocialIcon(social.platform);
										return (
											<a
												key={index}
												href={social.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-gray-600 transition-colors hover:text-gray-900"
												title={social.platform}
											>
												<IconComponent className="size-5" />
											</a>
										);
									},
								)}
							</div>
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
