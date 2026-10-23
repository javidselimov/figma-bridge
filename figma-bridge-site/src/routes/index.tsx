import { createFileRoute } from "@tanstack/react-router";

import { HomeView } from "@/views/home";

export const Route = createFileRoute("/")({ component: HomeView });
