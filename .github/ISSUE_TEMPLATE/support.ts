import { api } from './api';

export type UserType = 'member' | 'free';

export interface SupportPayload {
  issueType: 'bug' | 'feature' | 'translation';
  formData: Record<string, any>;
  userType: UserType;
}

export interface SupportResponse {
  message: string;
  url: string;
}

export const supportApi = api.injectEndpoints({
  endpoints: build => ({
    createIssue: build.mutation<SupportResponse, SupportPayload>({
      query: body => ({ url: `/support/issue`, method: 'POST', body }),
    }),
  }),
  overrideExisting: false,
});

export const { useCreateIssueMutation } = supportApi;
