export interface ProviderSendSuccess {
  success: true;
  providerMessageId: string;
}

export interface ProviderSendFailure {
  success: false;
  errorCode: string;
  errorMessage: string;
}

export type ProviderSendResult = ProviderSendSuccess | ProviderSendFailure;

export interface EmailSendRequest {
  destinationId: string;
  toAddress: string;
  subject: string;
  body: string;
}

export interface EmailProviderAdapter {
  send(request: EmailSendRequest): Promise<ProviderSendResult>;
}

export interface SmsSendRequest {
  destinationId: string;
  toPhoneNumber: string;
  body: string;
}

export interface SmsProviderAdapter {
  send(request: SmsSendRequest): Promise<ProviderSendResult>;
}

export interface FacebookPageSendRequest {
  destinationId: string;
  message: string;
  imageAssetId: string | null;
}

export interface FacebookPageProviderAdapter {
  post(request: FacebookPageSendRequest): Promise<ProviderSendResult>;
}
