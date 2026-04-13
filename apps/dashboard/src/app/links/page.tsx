import { PayLinksClient } from './pay-links-client';

export default function LinksPage() {
  return (
    <div className="px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-100">Pay Links</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Create shareable payment request links for your audience
        </p>
      </div>

      <PayLinksClient />
    </div>
  );
}
