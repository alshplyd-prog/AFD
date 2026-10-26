import React, { useState, useEffect } from 'react';
import {
  X,
  UserCheck,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Edit2,
  Trash2,
  Phone,
  Lock,
  UserPlus,
  CheckCircle2,
  XCircle,
  KeyRound,
  Sparkles,
  FolderKanban,
  Search,
  Smartphone,
  Check,
  Zap,
  Camera,
  Upload,
  User,
  Image as ImageIcon
} from 'lucide-react';
import { SalesRepresentative, CustomerList, Language } from '../types';
import { ActionMenu } from './ActionMenu';
import { hasDuplicateName, deduplicateEntitiesByName } from '../lib/nameHelpers';
import { normalizePin } from '../lib/pinUtils';

interface RepsManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  reps: SalesRepresentative[];
  customerLists?: CustomerList[];
  currentRep: SalesRepresentative | null;
  onSelectRep: (rep: SalesRepresentative) => void;
  onAddRep: (rep: Omit<SalesRepresentative, 'id'>) => Promise<void>;
  onUpdateRep: (id: string, data: Partial<SalesRepresentative>) => Promise<void>;
  onDeleteRep: (id: string) => Promise<void>;
  lang: Language;
}

export const RepsManagementModal: React.FC<RepsManagementModalProps> = ({
  isOpen,
  onClose,
  reps,
  customerLists = [],
  currentRep,
  onSelectRep,
  onAddRep,
  onUpdateRep,
  onDeleteRep,
  lang,
}) => {
  const isAr = lang === 'ar';

  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [editingRep, setEditingRep] = useState<SalesRepresentative | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'admin' | 'supervisor' | 'rep'>('rep');
  const [canEdit, setCanEdit] = useState(true);
  const [canDelete, setCanDelete] = useState(false);
  const [canMoveCustomer, setCanMoveCustomer] = useState(true);
  const [canSell, setCanSell] = useState(true);
  const [allowedListIds, setAllowedListIds] = useState<string[]>(['all']);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showModalToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Compress image file to compact data URL
  const compressImage = (file: File, maxSize = 220, quality = 0.82): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Image decode error'));
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleDirectAvatarUpload = async (repId: string, file: File) => {
    try {
      showModalToast(isAr ? 'جاري معالجة الصورة...' : 'Processing photo...');
      const dataUrl = await compressImage(file);
      await onUpdateRep(repId, { avatarUrl: dataUrl });
      showModalToast(isAr ? 'تم تحديث وحفظ صورة المندوب بنجاح' : 'Representative photo updated');
    } catch (err) {
      showModalToast(isAr ? 'فشل معالجة الصورة' : 'Failed to process photo');
    }
  };

  const handleFormFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessingImage(true);
      const dataUrl = await compressImage(file);
      setAvatarUrl(dataUrl);
    } catch (err) {
      setError(isAr ? 'تعذر قراءة ملف الصورة' : 'Could not read image file');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Deduplicate reps list for display
  const uniqueReps = React.useMemo(() => {
    return deduplicateEntitiesByName(reps);
  }, [reps]);

  if (!isOpen) return null;

  const handleOpenForm = (rep?: SalesRepresentative) => {
    if (rep) {
      setEditingRep(rep);
      setName(rep.name);
      setPhone(rep.phone || '');
      setCode(rep.code || '0000');
      setRole(rep.role || 'rep');
      setCanEdit(rep.canEdit !== false);
      setCanDelete(Boolean(rep.canDelete) || rep.role === 'admin');
      setCanMoveCustomer(rep.canMoveCustomer !== false);
      setCanSell(rep.canSell !== false);
      setAllowedListIds(rep.allowedListIds || ['all']);
      setAvatarUrl(rep.avatarUrl || '');
    } else {
      setEditingRep(null);
      setName('');
      setPhone('');
      setCode('');
      setRole('rep');
      setCanEdit(true);
      setCanDelete(false);
      setCanMoveCustomer(true);
      setCanSell(true);
      setAllowedListIds(['all']);
      setAvatarUrl('');
    }
    setError('');
    setIsAddFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(isAr ? 'يرجى إدخال اسم المندوب' : 'Representative name is required');
      return;
    }

    if (hasDuplicateName(reps, trimmedName, editingRep?.id)) {
      setError(isAr ? 'عذراً، اسم المندوب مسجل مسبقاً ولا يمكن تكراره' : 'Representative name already exists');
      return;
    }

    try {
      const normalizedPin = normalizePin(code) || '0000';
      if (editingRep) {
        await onUpdateRep(editingRep.id, {
          name: trimmedName,
          phone: phone.trim(),
          code: normalizedPin,
          role,
          canEdit,
          canDelete,
          canMoveCustomer,
          canSell,
          allowedListIds,
          avatarUrl,
        });
      } else {
        await onAddRep({
          name: trimmedName,
          phone: phone.trim(),
          code: normalizedPin,
          role,
          canEdit,
          canDelete,
          canMoveCustomer,
          canSell,
          allowedListIds,
          avatarUrl,
        });
      }
      setIsAddFormOpen(false);
    } catch (err: any) {
      setError(err?.message || (isAr ? 'حدث خطأ أثناء حفظ البيانات' : 'Error saving representative'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDeleteRep(id);
      setDeletingId(null);
    } catch (err) {
      setError(isAr ? 'فشل حذف المندوب' : 'Failed to delete representative');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-3 md:p-5 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-6xl xl:max-w-7xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[96vh] dir-rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between gap-2 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-400" />
            <h3 className="font-extrabold text-sm">{isAr ? 'إدارة المندوبين والصلاحيات' : 'Representatives Management'}</h3>
            <span className="px-2 py-0.5 rounded-md bg-white/20 text-[11px] font-bold">
              {uniqueReps.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isAddFormOpen && (
              <button
                onClick={() => handleOpenForm()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة مندوب' : 'Add'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-3 sm:space-y-4">
          {toastMessage && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold rounded-xl text-center animate-in fade-in">
              {toastMessage}
            </div>
          )}

          {!isAddFormOpen ? (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-black uppercase text-slate-600 dark:text-slate-300">
                  {isAr ? `قائمة المندوبين (${uniqueReps.length})` : `Representatives (${uniqueReps.length})`}
                </h3>

                <button
                  onClick={() => handleOpenForm()}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isAr ? 'إضافة مندوب جديد' : 'Add Representative'}</span>
                </button>
              </div>

              {/* Reps Cards List */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                {uniqueReps.map((rep) => {
                  const isActive = currentRep?.id === rep.id || currentRep?.name === rep.name;
                  const repCanEdit = rep.canEdit !== false;
                  const repCanDelete = Boolean(rep.canDelete) || rep.role === 'admin';
                  const repCanSell = rep.canSell !== false;

                  return (
                    <div
                      key={rep.id}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between gap-3 ${
                        isActive
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-500 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700/80 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        {/* Rep Photo / Avatar with Hover/Tap Camera Action */}
                        <div className="relative group/avatar shrink-0">
                          {rep.avatarUrl ? (
                            <img
                              src={rep.avatarUrl}
                              alt={rep.name}
                              referrerPolicy="no-referrer"
                              className="w-14 h-14 rounded-2xl object-cover border-2 border-indigo-500 shadow-md shrink-0"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div
                              className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl border-2 shadow-xs shrink-0 ${
                                rep.role === 'admin'
                                  ? 'bg-amber-100 text-amber-800 border-amber-400 dark:bg-amber-950 dark:text-amber-300'
                                  : rep.role === 'supervisor'
                                  ? 'bg-rose-100 text-rose-800 border-rose-400 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-indigo-100 text-indigo-800 border-indigo-400 dark:bg-indigo-950 dark:text-indigo-300'
                              }`}
                            >
                              {rep.name ? rep.name.trim().charAt(0) : <User className="w-6 h-6" />}
                            </div>
                          )}
                          <label
                            className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover/avatar:opacity-100 flex flex-col items-center justify-center text-white cursor-pointer transition-opacity backdrop-blur-2xs"
                            title={isAr ? 'تغيير صورة المندوب' : 'Change photo'}
                          >
                            <Camera className="w-4 h-4" />
                            <span className="text-[9px] font-bold mt-0.5">{isAr ? 'تغيير' : 'Change'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleDirectAvatarUpload(rep.id, f);
                              }}
                            />
                          </label>
                        </div>

                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm truncate">
                              {rep.name}
                            </h4>
                            {isActive && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-600 text-white flex items-center gap-1 shrink-0">
                                <Smartphone className="w-3 h-3" />
                                <span>{isAr ? 'هذا الجهاز (أنت)' : 'This Device (You)'}</span>
                              </span>
                            )}
                            {rep.role === 'admin' ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0">
                                {isAr ? 'مدير التطبيق' : 'Admin'}
                              </span>
                            ) : rep.role === 'supervisor' ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shrink-0">
                                {isAr ? 'مسؤول' : 'Supervisor'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 shrink-0">
                                {isAr ? 'مندوب' : 'Sales Rep'}
                              </span>
                            )}
                          </div>

                          {rep.phone && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 dir-ltr text-right">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{rep.phone}</span>
                            </p>
                          )}

                          {/* Permissions Status Indicators */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
                                repCanSell
                                  ? 'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800'
                                  : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {repCanSell ? <CheckCircle2 className="w-3 h-3 text-teal-600" /> : <XCircle className="w-3 h-3 text-slate-400" />}
                              {isAr ? 'صلاحية البيع' : 'Sell Permission'}
                            </span>

                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
                                repCanEdit
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                  : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {repCanEdit ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-slate-400" />}
                              {isAr ? 'تعديل القسط والعقود' : 'Edit Installment'}
                            </span>

                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
                                repCanDelete
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                  : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {repCanDelete ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-slate-400" />}
                              {isAr ? 'صلاحية الحذف' : 'Delete Permission'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Rep Card Actions */}
                      <div className="flex items-center gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-700/60">
                        {!isActive && (
                          <button
                            onClick={() => {
                              onSelectRep(rep);
                              showModalToast(isAr ? `تم تحويل هذا الجهاز إلى حساب: ${rep.name}` : `Switched to account ${rep.name}`);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-indigo-600 hover:text-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
                          >
                            {isAr ? 'الدخول بهذا الحساب' : 'Switch to Account'}
                          </button>
                        )}

                        <ActionMenu
                          isAr={isAr}
                          onEdit={() => handleOpenForm(rep)}
                          onDelete={() => setDeletingId(rep.id)}
                        />
                      </div>

                      {/* Confirm Delete Sub-box */}
                      {deletingId === rep.id && (
                        <div className="w-full mt-2 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 rounded-xl text-center space-y-2">
                          <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                            {isAr ? `تأكيد حذف الحساب (${rep.name})؟` : `Delete representative (${rep.name})?`}
                          </p>
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-3 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg border"
                            >
                              {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                              onClick={() => handleDelete(rep.id)}
                              className="px-3 py-1 bg-rose-600 text-white text-xs font-bold rounded-lg shadow-xs hover:bg-rose-700"
                            >
                              {isAr ? 'حذف' : 'Confirm'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            /* Add or Edit Representative Form */
            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-indigo-600" />
                  <span>
                    {editingRep
                      ? isAr ? 'تعديل حساب المندوب والصلاحيات' : 'Edit Representative'
                      : isAr ? 'إضافة حساب مندوب جديد' : 'Add New Representative'}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen(false)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold hover:bg-slate-200"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>

              {/* Profile Photo / Avatar Section */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 flex items-center gap-4">
                <div className="relative group shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Preview"
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-500 shadow-sm"
                    />
                  ) : (
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl border-2 shadow-xs ${
                        role === 'admin'
                          ? 'bg-amber-100 text-amber-800 border-amber-400 dark:bg-amber-950 dark:text-amber-300'
                          : role === 'supervisor'
                          ? 'bg-rose-100 text-rose-800 border-rose-400 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-indigo-100 text-indigo-800 border-indigo-400 dark:bg-indigo-950 dark:text-indigo-300'
                      }`}
                    >
                      {name ? name.trim().charAt(0) : <User className="w-7 h-7" />}
                    </div>
                  )}
                  {isProcessingImage && (
                    <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center">
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800 dark:text-slate-200 text-xs">
                      {isAr ? 'صورة المندوب الشخصية' : 'Representative Profile Photo'}
                    </span>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700"
                      >
                        {isAr ? 'إزالة الصورة' : 'Remove Photo'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{isAr ? 'اختيار / التقاط صورة' : 'Choose / Capture Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFormFileSelect}
                      />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-normal">
                    {isAr
                      ? 'يمكنك رفع صورة من المعرض أو التقاطها مباشرة، ويتم ضغطها وحفظها في قاعدة البيانات'
                      : 'Upload from gallery or take a photo; compressed and saved automatically'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block font-extrabold text-slate-800 dark:text-slate-200 mb-1">
                  {isAr ? 'اسم المندوب / صاحب الحساب *' : 'Representative Name *'}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isAr ? 'مثال: علي تحصيل' : 'e.g. Ali Sales'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-extrabold text-slate-800 dark:text-slate-200 mb-1">
                    {isAr ? 'رقم الهاتف' : 'Phone Number'}
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={phone}
                    onChange={(e) => {
                      const converted = e.target.value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
                      setPhone(converted.replace(/\D/g, ''));
                    }}
                    placeholder="07801234567"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-semibold dir-ltr text-left font-mono"
                  />
                </div>

                <div>
                  <label className="block font-extrabold text-slate-800 dark:text-slate-200 mb-1">
                    {isAr ? 'رمز الدخول (PIN)' : 'PIN Code'}
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={code}
                    onChange={(e) => {
                      const converted = e.target.value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
                      setCode(converted.replace(/\D/g, ''));
                    }}
                    placeholder="1234"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold dir-ltr text-left font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-extrabold text-slate-800 dark:text-slate-200 mb-1">
                  {isAr ? 'نوع الحساب' : 'Role'}
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'admin' | 'supervisor' | 'rep')}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold focus:outline-none"
                >
                  <option value="rep">{isAr ? 'مندوب' : 'Sales Representative'}</option>
                  <option value="supervisor">{isAr ? 'مسؤول' : 'Supervisor'}</option>
                  <option value="admin">{isAr ? 'مدير التطبيق' : 'Admin'}</option>
                </select>
              </div>

              {/* Permissions Checkbox Toggles Section */}
              <div className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 space-y-3">
                <h4 className="font-black text-xs text-indigo-900 dark:text-indigo-200">
                  {isAr ? 'صلاحيات الحساب (Permissions):' : 'Account Permissions:'}
                </h4>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={canSell}
                    onChange={(e) => setCanSell(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs block">
                      {isAr ? 'صلاحية البيع (إضافة مبيع جديد)' : 'Sell Permission (New Sale)'}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      {isAr
                        ? 'السماح للمندوب بإنشاء وعقد مبيعات جديدة للزبائن'
                        : 'Allow representative to create new sales contracts for customers'}
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none pt-2 border-t border-indigo-200/60 dark:border-indigo-800/60">
                  <input
                    type="checkbox"
                    checked={canEdit}
                    onChange={(e) => setCanEdit(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs block">
                      {isAr ? 'صلاحية التعديل (Edit)' : 'Edit Permission'}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      {isAr
                        ? 'السماح بتعديل القسط وعقود الزبائن والمخزن (يمنع تعديل الدفعات نهائياً)'
                        : 'Allow editing contracts, installments and inventory (payment edits strictly forbidden)'}
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none pt-2 border-t border-indigo-200/60 dark:border-indigo-800/60">
                  <input
                    type="checkbox"
                    checked={canDelete}
                    onChange={(e) => setCanDelete(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs block">
                      {isAr ? 'صلاحية الحذف (Delete)' : 'Delete Permission'}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      {isAr
                        ? 'السماح للمندوب بحذف الزبائن، العقود، المواد، والدفعات'
                        : 'Allow representative to delete contracts, payments & items'}
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none pt-2 border-t border-indigo-200/60 dark:border-indigo-800/60">
                  <input
                    type="checkbox"
                    checked={canMoveCustomer}
                    onChange={(e) => setCanMoveCustomer(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs block">
                      {isAr ? 'صلاحية نقل الزبائن بين القوائم (Move Customer)' : 'Move Customer Permission'}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      {isAr
                        ? 'السماح للمندوب بنقل الزبون من قائمة إلى قائمة أخرى'
                        : 'Allow representative to move customers between lists'}
                    </span>
                  </div>
                </label>
              </div>

              {/* Customer Lists Access Permission Section */}
              <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 space-y-2.5">
                <h4 className="font-black text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <FolderKanban className="w-4 h-4 text-amber-600" />
                  <span>{isAr ? 'صلاحية الوصول للقوائم (Customer Lists Access):' : 'Allowed Customer Lists:'}</span>
                </h4>
                <p className="text-[10px] text-amber-800/80 dark:text-amber-300/80">
                  {isAr
                    ? 'حدد القوائم التي يُسمح للمندوب باستعراض زبائنها وتعديلها'
                    : 'Select lists this representative is permitted to see'}
                </p>

                <div className="space-y-1.5 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none font-bold text-xs">
                    <input
                      type="checkbox"
                      checked={allowedListIds.includes('all')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAllowedListIds(['all']);
                        } else {
                          setAllowedListIds([]);
                        }
                      }}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>{isAr ? 'جميع القوائم (وصول كامل لكل الزبائن)' : 'All Lists (Full Access)'}</span>
                  </label>

                  {!allowedListIds.includes('all') && customerLists.map((list) => {
                    const isChecked = allowedListIds.includes(list.id);
                    return (
                      <label key={list.id} className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 dark:text-slate-300 pr-4">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAllowedListIds((prev) => [...prev.filter((id) => id !== 'all'), list.id]);
                            } else {
                              setAllowedListIds((prev) => prev.filter((id) => id !== list.id));
                            }
                          }}
                          className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <span>{list.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {error && <p className="text-rose-600 font-bold text-xs">{error}</p>}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsAddFormOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-extrabold hover:bg-indigo-700 shadow-sm"
                >
                  {editingRep ? (isAr ? 'تحديث الحساب' : 'Update') : (isAr ? 'حفظ المندوب' : 'Save')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
