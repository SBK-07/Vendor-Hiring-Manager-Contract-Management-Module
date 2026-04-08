import HiringManagerOpeningProfilesLayout from "@/components/UserDashboardPage/HIRING_MANAGER/HiringManagerOpeningProfilesLayout";

export default async function HiringManagerOpeningDetailPage({ params }) {
  const resolvedParams = await params;

  return (
    <div className="w-full">
      <HiringManagerOpeningProfilesLayout openingId={resolvedParams.id} />
    </div>
  );
}
