import { prependBackendUrl } from '@workspace/core/url.js';

interface LoginProps {
	state?: string;
	authUrl: string;
	target?: string;
}

export default function Login({ state, authUrl, target = '_blank' }: LoginProps) {
	const handleLogin = () => {
		window.open(prependBackendUrl(authUrl), target);
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-[#FBFBFB]">
			<div className="w-full max-w-md space-y-8">
				<div className="text-center">
					<h2 className="text-3xl font-bold text-slate-900">Sign in to Marlo</h2>
					<p className="mt-2 text-sm text-slate-600">Please sign in to continue</p>
				</div>

				<div className="space-y-4">
					<button
						type="button"
						onClick={handleLogin}
						className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
					>
						Sign in with Google
					</button>
				</div>
			</div>
		</div>
	);
}
