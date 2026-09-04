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
import { Link, useLoaderData, useRouter } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

import { Avatar } from "./bits";

export default function UserMenu() {
  const router = useRouter();
  const data = useLoaderData({ from: "__root__" });
  const user = data?.user;

  if (!user) {
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
            <div className="text-[13px] font-medium text-foreground">{user.name}</div>
            <div className="truncate">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
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
