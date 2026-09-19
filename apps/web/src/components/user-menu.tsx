import { Button } from "@openheard/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openheard/ui/components/dropdown-menu";
import { GearSixIcon } from "@phosphor-icons/react";
import { Link, useLoaderData, useRouter } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { isDemo } from "@/lib/demo";

import { Avatar } from "./bits";

export default function UserMenu() {
  const router = useRouter();
  const data = useLoaderData({ from: "__root__" });
  const user = data?.user;

  if (!user) {
    // Nobody signs up for the demo; one click puts them in its dashboard.
    if (isDemo(data?.workspace)) {
      return (
        <Button variant="outline" size="sm" nativeButton={false} render={<a href="/demo" />}>
          Open dashboard
        </Button>
      );
    }
    return (
      <Link to="/login">
        <Button variant="outline" size="sm">
          Sign in
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <Avatar name={user.name} image={user.image} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="text-[13px] font-semibold text-foreground">{user.name}</div>
            <div className="truncate">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.role === "admin" ? (
            <DropdownMenuItem render={<Link to="/dashboard/inbox" />}>
              <GearSixIcon className="size-4" /> Dashboard
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() =>
              authClient.signOut({ fetchOptions: { onSuccess: () => router.invalidate().then(() => router.navigate({ to: "/" })) } })
            }
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
