/** Generic API types shared by every service. */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A JSON-serialisable value. Use instead of `any` for request bodies. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A file to upload with multipart/form-data. `uri` comes from expo-image-picker. */
export interface UploadFile {
  uri: string;
  name: string;
  type: string; // MIME type, e.g. "image/jpeg"
}

/** Lifecycle of any async operation in the UI. */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';
