import VendorOpeningDetailsLayout from "@/components/UserDashboardPage/IT_VENDOR/Openings/VendorOpeningDetailsLayout";

export default async function VendorOpeningDetailsPage({ params }) {
  const resolvedParams = await params;

  return (
    <div className="w-full">
      <VendorOpeningDetailsLayout openingId={resolvedParams.id} />
    </div>
  );
}
