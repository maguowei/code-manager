import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

interface UnsavedChangesAlertDialogProps {
  canSave: boolean;
  isSaving?: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndExit: () => void;
}

function UnsavedChangesAlertDialog({
  canSave,
  isSaving = false,
  onCancel,
  onDiscard,
  onSaveAndExit,
}: UnsavedChangesAlertDialogProps) {
  const { t } = useI18n();

  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("common.unsavedChanges.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("common.unsavedChanges.message")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.unsavedChanges.keepEditing")}</AlertDialogCancel>
          <Button type="button" variant="outline" onClick={onDiscard}>
            {t("common.unsavedChanges.discard")}
          </Button>
          <Button type="button" disabled={!canSave || isSaving} onClick={onSaveAndExit}>
            {t("common.unsavedChanges.saveAndExit")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default UnsavedChangesAlertDialog;
