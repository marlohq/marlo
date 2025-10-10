import type { gaxios } from 'google-auth-library';
import type { gmail_v1 } from 'googleapis';

export type Gmail = gmail_v1.Gmail;

export type MessageGetResponse = gaxios.GaxiosResponse<gmail_v1.Schema$Message>;
export type DraftSchema = gmail_v1.Schema$Draft;
