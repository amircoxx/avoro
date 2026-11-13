/** Owner-only profile editor that stages form and media changes before one save operation. */
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  addDraftMedia,
  checkpointRemovedMedia,
  checkpointUploadedMedia,
  clearProfileMediaDraft,
  createProfileMediaDraft,
  removeDraftMedia,
  type ProfileMediaDraft,
  type ProfileMediaRole
} from "@/pages/tech-profile/profile-media-draft";
import { TechProfilePreview } from "@/pages/tech-profile/tech-profile-preview";
import { TechProfileDetailsModal } from "@/pages/tech-profile/tech-profile-details-modal";
import {
  isTechProfileDirty,
  mediaRoleLabel,
  revokeObjectUrls,
  shouldSaveTechProfile
} from "@/pages/tech-profile/editor-state";
import { TechProfileEditorHeader } from "@/pages/tech-profile/tech-profile-editor-header";
import { TechProfileEmptyState } from "@/pages/tech-profile/tech-profile-empty-state";
import { TechProfileLoadingState } from "@/pages/tech-profile/tech-profile-loading-state";
import { useAccountAuth } from "@/context/account-auth-context";
import { useRouter } from "@/hooks/router";
import { useUnsavedNavigationBlocker } from "@/hooks/use-unsaved-navigation-blocker";
import {
  getOwnTechProfile,
  saveTechProfile,
  initialTechOnboardingForm,
  mapOwnerTechProfileToOnboardingState,
  removeProfileMedia,
  uploadProfileMedia,
  type LocationSuggestion,
  type TechOnboardingForm
} from "@/services/api";
import { clearPendingReferralCode, readPendingReferralCode } from "@/utils/pending-referral";

export default function TechProfilePage() {
  const navigate = useRouter().push;
  const { authUser: user, isAuthLoading } = useAccountAuth();
  const [techForm, setTechForm] = useState<TechOnboardingForm>({ ...initialTechOnboardingForm });
  const [techLocation, setTechLocation] = useState<LocationSuggestion | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [mediaDraft, setMediaDraft] = useState<ProfileMediaDraft>(() => createProfileMediaDraft({
    profileImage: null,
    backgroundImage: null,
    galleryImages: []
  }));
  const mediaDraftRef = useRef(mediaDraft);
  const [savedTechForm, setSavedTechForm] = useState<TechOnboardingForm>({ ...initialTechOnboardingForm });
  const [savedTechLocation, setSavedTechLocation] = useState<LocationSuggestion | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [profileLoadAttempt, setProfileLoadAttempt] = useState(0);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const isMountedRef = useRef(true);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  const isDirty = isTechProfileDirty(
    techForm,
    techLocation,
    mediaDraft,
    savedTechForm,
    savedTechLocation,
    { pendingUploads: [], removedMediaIds: [] }
  );

  useEffect(() => {
    mediaDraftRef.current = mediaDraft;
  }, [mediaDraft]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => () => revokeObjectUrls(clearProfileMediaDraft(mediaDraftRef.current)), []);

  useEffect(() => {
    if (!isDirty) return;

    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [isDirty]);

  useUnsavedNavigationBlocker(isDirty, {
    confirm: window.confirm,
    onDiscard: () => revokeObjectUrls(clearProfileMediaDraft(mediaDraftRef.current))
  });

  useEffect(() => {
    let isCurrentRequest = true;
    if (isAuthLoading) return () => { isCurrentRequest = false; };
    if (!user || user.role !== "TECH") {
      navigate("/");
      return () => { isCurrentRequest = false; };
    }

    setIsProfileLoading(true);
    setHasProfile(null);
    setProfileLoadError(null);
    getOwnTechProfile()
      .then((profile) => {
        if (!isCurrentRequest) return;
        setHasProfile(Boolean(profile));
        if (!profile) {
          const nextForm = { ...initialTechOnboardingForm, referredByCode: readPendingReferralCode() };
          setTechForm(nextForm);
          setSavedTechForm(nextForm);
          return;
        }

        const nextState = mapOwnerTechProfileToOnboardingState(profile);
        setTechForm(nextState.form);
        setTechLocation(nextState.location);
        setReferralCode(profile.referralCode);
        const savedMedia = {
          profileImage: profile.profileImage,
          backgroundImage: profile.backgroundImage,
          galleryImages: profile.galleryImages
        };
        setMediaDraft(createProfileMediaDraft(savedMedia));
        setSavedTechForm(nextState.form);
        setSavedTechLocation(nextState.location);
      })
      .catch((error) => {
        if (!isCurrentRequest) return;
        const message = error instanceof Error ? error.message : "Profile could not be loaded";
        setProfileLoadError(message);
        toast.error(message);
      })
      .finally(() => {
        if (isCurrentRequest) setIsProfileLoading(false);
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [isAuthLoading, navigate, profileLoadAttempt, user]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    let queuedUploadFailed = false;

    try {
      if (!shouldSaveTechProfile(techForm)) {
        toast.error("Add profile details before saving.");
        return;
      }
      if (!techLocation) {
        toast.error("Choose a city before saving your tech profile.");
        return;
      }

      await saveTechProfile(techForm, techLocation);
      clearPendingReferralCode();
      if (!isMountedRef.current) return;
      setHasProfile(true);
      setIsCreatingProfile(false);
      let retryDraft = mediaDraft;
      let savedMedia = mediaDraft.preview;
      for (const mediaId of retryDraft.removedMediaIds) {
        savedMedia = await removeProfileMedia(mediaId);
        if (!isMountedRef.current) return;
        retryDraft = checkpointRemovedMedia(retryDraft, mediaId, savedMedia);
        setMediaDraft(retryDraft);
      }
      let pendingUploadRole: ProfileMediaRole | null = null;
      try {
        for (const upload of retryDraft.pendingUploads) {
          pendingUploadRole = upload.role;
          savedMedia = await uploadProfileMedia(upload.file, upload.role);
          if (!isMountedRef.current) return;
          retryDraft = checkpointUploadedMedia(retryDraft, upload.localId, savedMedia);
          URL.revokeObjectURL(upload.objectUrl);
          setMediaDraft(retryDraft);
        }
      } catch (error) {
        queuedUploadFailed = true;
        if (!isMountedRef.current) return;
        setMediaDraft(retryDraft);
        toast.error(`Your ${mediaRoleLabel(pendingUploadRole)} image could not be uploaded. Try saving again.`);
        throw error;
      }
      revokeObjectUrls(clearProfileMediaDraft(retryDraft));
      setMediaDraft(createProfileMediaDraft(savedMedia));
      setSavedTechForm({ ...techForm });
      setSavedTechLocation(techLocation);
      try {
        const refreshedProfile = await getOwnTechProfile();
        if (!isMountedRef.current) return;
        if (refreshedProfile) {
          const nextState = mapOwnerTechProfileToOnboardingState(refreshedProfile);
          setTechForm(nextState.form);
          setTechLocation(nextState.location);
          const refreshedMedia = {
            profileImage: refreshedProfile.profileImage,
            backgroundImage: refreshedProfile.backgroundImage,
            galleryImages: refreshedProfile.galleryImages
          };
          setMediaDraft(createProfileMediaDraft(refreshedMedia));
          setSavedTechForm(nextState.form);
          setSavedTechLocation(nextState.location);
        }
      } catch {
        // A refresh failure must not turn an already-saved profile into a save failure.
      }
      if (!isMountedRef.current) return;
      toast.success("Profile saved.");
    } catch (error) {
      if (!queuedUploadFailed && isMountedRef.current) {
        toast.error(error instanceof Error ? error.message : "Profile could not be saved");
      }
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }

  async function handleAddMedia(file: File, role: ProfileMediaRole) {
    const objectUrl = URL.createObjectURL(file);
    const result = addDraftMedia(mediaDraft, file, role, objectUrl);
    if (!result.ok) {
      URL.revokeObjectURL(objectUrl);
      toast.error(result.error);
      return;
    }
    revokeObjectUrls(result.revokedObjectUrls);
    setMediaDraft(result.draft);
  }

  function handleRemoveMedia(mediaId: string) {
    const result = removeDraftMedia(mediaDraft, mediaId);
    revokeObjectUrls(result.revokedObjectUrls);
    setMediaDraft(result.draft);
  }

  function leavePage() {
    navigate("/");
  }

  if (isAuthLoading || !user || user.role !== "TECH") {
    return <main className="editorial-page editorial-tech-profile min-h-[calc(100vh-4rem)]" />;
  }

  if (isProfileLoading || hasProfile === null) {
    return <TechProfileLoadingState error={profileLoadError} onRetry={() => setProfileLoadAttempt((attempt) => attempt + 1)} />;
  }

  if (hasProfile === false && !isCreatingProfile) {
    return <TechProfileEmptyState onCreate={() => { setIsCreatingProfile(true); setIsDetailsModalOpen(true); }} />;
  }

  return (
    <main className="editorial-page editorial-tech-profile min-h-[calc(100vh-4rem)] px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-7xl">
        <TechProfileEditorHeader onBack={leavePage} />
        <TechProfilePreview
          form={techForm}
          location={techLocation}
          media={mediaDraft.preview}
          rating={0}
          reviewCount={0}
          referralCode={referralCode}
          editing={{
            disabled: isSaving,
            onAdd: handleAddMedia,
            onRemove: handleRemoveMedia,
            onEditDetails: () => setIsDetailsModalOpen(true),
            editButtonRef
          }}
        />
        {isDetailsModalOpen ? (
          <TechProfileDetailsModal
            form={techForm}
            location={techLocation}
            isSaving={isSaving}
            onChange={setTechForm}
            onLocationChange={setTechLocation}
            onClose={() => {
              setIsDetailsModalOpen(false);
              editButtonRef.current?.focus();
            }}
            onSave={handleSubmit}
          />
        ) : null}
      </div>
    </main>
  );
}
