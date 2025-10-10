declare namespace CSS {
	interface PropertyDefinition {
		name: string;
		syntax?: string;
		inherits: boolean;
		initialValue?: string;
	}
}

interface CSSStyleDeclaration {
	viewTransitionName?: string;
	viewTransitionClass?: string;
}
