"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, LogOut } from "lucide-react";

type FormState = "idle" | "saving" | "saved";

export default function AccountSettingsPage() {
  const { status, user, signIn, signOut, isProcessing } = useAuth();
  const [profileState, setProfileState] = useState<FormState>("idle");
  const [notificationsState, setNotificationsState] = useState<FormState>("idle");

  const isSignedIn = status === "signed-in" && Boolean(user);

  const fullName = useMemo(() => user?.fullName ?? "", [user?.fullName]);
  const email = useMemo(() => user?.email ?? "", [user?.email]);
  const role = useMemo(() => user?.role ?? "", [user?.role]);

  useEffect(() => {
    if (profileState !== "saved" && notificationsState !== "saved") {
      return;
    }

    const timer = setTimeout(() => {
      setProfileState(prev => (prev === "saved" ? "idle" : prev));
      setNotificationsState(prev => (prev === "saved" ? "idle" : prev));
    }, 2000);

    return () => clearTimeout(timer);
  }, [profileState, notificationsState]);

  const handleProfileSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (profileState === "saving") return;

      setProfileState("saving");
      setTimeout(() => {
        setProfileState("saved");
      }, 700);
    },
    [profileState]
  );

  const handleNotificationsSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (notificationsState === "saving") return;

      setNotificationsState("saving");
      setTimeout(() => {
        setNotificationsState("saved");
      }, 600);
    },
    [notificationsState]
  );

  const handleSignOut = useCallback(() => {
    if (!isProcessing) {
      void signOut();
    }
  }, [isProcessing, signOut]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-[60vh] bg-gradient-to-br from-slate-50 via-white to-purple-50">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-16 text-center">
          <Card className="w-full bg-white/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-3xl">Accédez à vos paramètres</CardTitle>
              <CardDescription>
                Connectez-vous pour gérer votre profil, vos préférences de communication et vos contrôles de sécurité.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <Button onClick={() => void signIn()} disabled={isProcessing} className="rounded-full px-6">
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connexion en cours...
                  </>
                ) : (
                  "Se connecter"
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Vous n'avez pas encore de compte ? Continuez en tant qu'invité pour explorer les fonctionnalités puis créez
                votre profil lorsque vous serez prêt.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 pb-16">
      <div className="mx-auto w-full max-w-5xl space-y-10 px-6 pt-12">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            Profil
          </div>
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Paramètres du compte</h1>
          <p className="text-base text-muted-foreground md:text-lg">
            Personnalisez vos informations personnelles, contrôlez vos notifications et assurez la sécurité de votre compte.
          </p>
        </header>

        <section className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <Card className="border-primary/10 bg-white/80 shadow-sm backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle>Informations personnelles</CardTitle>
              <CardDescription>Mettez à jour votre identité visible par les autres participants.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={handleProfileSubmit}>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nom complet</Label>
                    <Input id="fullName" name="fullName" defaultValue={fullName} placeholder="Votre nom" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Adresse e-mail</Label>
                    <Input id="email" name="email" type="email" defaultValue={email} readOnly className="bg-muted/30" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Rôle</Label>
                    <Input id="role" name="role" defaultValue={role ?? ""} placeholder="Facilitateur, Contributeur..." />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Vos modifications seront synchronisées avec vos prochaines sessions.
                  </div>
                  <Button type="submit" disabled={profileState === "saving"} className="rounded-full px-6">
                    {profileState === "saving" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enregistrement
                      </>
                    ) : (
                      "Enregistrer"
                    )}
                  </Button>
                </div>
              </form>

              {profileState === "saved" && (
                <div className="mt-6">
                  <Alert className="border-primary/30 bg-primary/5">
                    <AlertTitle>Profil mis à jour</AlertTitle>
                    <AlertDescription>
                      Vos informations ont été enregistrées. Cette section est actuellement une démonstration en attendant la connexion à la base de données.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/10 bg-white/80 shadow-sm backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle>Préférences de communication</CardTitle>
              <CardDescription>Choisissez comment vous souhaitez être tenu informé des projets et défis.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={handleNotificationsSubmit}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="digest-frequency">Fréquence du résumé</Label>
                    <Input id="digest-frequency" name="digest-frequency" defaultValue="Chaque semaine" />
                    <p className="text-xs text-muted-foreground">
                      Recevez une synthèse des nouvelles discussions et décisions à la fréquence de votre choix.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="alerts">Alertes prioritaires</Label>
                    <Input id="alerts" name="alerts" defaultValue="Défis critiques, Nouveaux livrables" />
                    <p className="text-xs text-muted-foreground">
                      Définissez les sujets pour lesquels vous souhaitez être notifié immédiatement.
                    </p>
                  </div>
                </div>

                <Button type="submit" disabled={notificationsState === "saving"} className="w-full rounded-full">
                  {notificationsState === "saving" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Mise à jour
                    </>
                  ) : (
                    "Sauvegarder les préférences"
                  )}
                </Button>
              </form>

              {notificationsState === "saved" && (
                <div className="mt-6">
                  <Alert className="border-primary/30 bg-primary/5">
                    <AlertTitle>Préférences enregistrées</AlertTitle>
                    <AlertDescription>
                      Nous vous tiendrons informé selon ces paramètres. Cette section illustre les futures intégrations avec les notifications.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-dashed border-primary/20 bg-white/70 shadow-sm backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle>Sécurité du compte</CardTitle>
              <CardDescription>
                Gérez les sessions actives, la récupération de compte et les intégrations. Des contrôles avancés seront ajoutés prochainement.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Vous êtes connecté en tant que {fullName}</p>
                <p className="text-xs text-muted-foreground">
                  Si vous utilisez un poste partagé, n'oubliez pas de vous déconnecter après vos sessions.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleSignOut}
                disabled={isProcessing}
                className="gap-2 rounded-full border-primary/40 text-primary hover:bg-primary/10"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Se déconnecter
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

