import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { YaoyaoApp } from "@/components/yaoyao/YaoyaoApp";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "妖妖乐 · 你的专属情绪小妖怪" },
      { name: "description", content: "妖妖乐：可爱风 AI 情绪人格报告 + 占卜屋，生成你的专属小妖怪。" },
    ],
  }),
});

function Index() {
  return (
    <>
      <YaoyaoApp />
      <Toaster position="top-center" />
    </>
  );
}
