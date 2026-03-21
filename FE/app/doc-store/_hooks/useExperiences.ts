import { useEffect, useState } from "react";
import {
  Experience,
  createExperience,
  deleteExperience,
  getExperiences,
  updateExperience,
} from "@/lib/api/experiences";

export function useExperiences() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [expLoading, setExpLoading] = useState(true);
  const [expSearch, setExpSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Experience | undefined>();

  useEffect(() => {
    getExperiences().then(setExperiences).finally(() => setExpLoading(false));
  }, []);

  const handleExpSave = async (data: { title: string; content: string; category?: string }) => {
    if (editTarget) {
      const updated = await updateExperience(editTarget.id, data);
      setExperiences((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } else {
      const created = await createExperience(data);
      setExperiences((prev) => [created, ...prev]);
    }
  };

  const handleExpDelete = async (id: string) => {
    await deleteExperience(id);
    setExperiences((prev) => prev.filter((e) => e.id !== id));
  };

  const openAdd = () => {
    setEditTarget(undefined);
    setModalOpen(true);
  };

  const openEdit = (exp: Experience) => {
    setEditTarget(exp);
    setModalOpen(true);
  };

  const filteredExp = experiences.filter((e) => {
    const matchSearch =
      !expSearch ||
      e.title.toLowerCase().includes(expSearch.toLowerCase()) ||
      e.content.toLowerCase().includes(expSearch.toLowerCase());
    const matchCategory = !categoryFilter || e.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const allCategories = Array.from(
    new Set(experiences.map((e) => e.category).filter(Boolean)),
  ) as string[];

  const updateExpCategory = async (id: string, category: string) => {
    const updated = await updateExperience(id, { category });
    setExperiences((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  return {
    experiences,
    expLoading,
    expSearch,
    setExpSearch,
    categoryFilter,
    setCategoryFilter,
    modalOpen,
    setModalOpen,
    editTarget,
    filteredExp,
    allCategories,
    handleExpSave,
    handleExpDelete,
    updateExpCategory,
    openAdd,
    openEdit,
  };
}
