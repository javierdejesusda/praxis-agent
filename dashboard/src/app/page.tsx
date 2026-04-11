"use client";

import { motion } from "framer-motion";
import React from "react";
import { useRouter } from "next/navigation";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { BtcIcon, EthIcon } from "@/components/ui/CryptoIcon";

export default function HeroPage() {
  const router = useRouter();

  return (
    <AuroraBackground>
      <motion.div
        initial={{ opacity: 0.0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.3,
          duration: 0.8,
          ease: "easeInOut",
        }}
        className="relative flex flex-col gap-4 items-center justify-center px-4"
      >
        <div className="flex items-center gap-4 mb-2">
          <BtcIcon size={44} />
          <EthIcon size={44} />
        </div>
        <div className="text-3xl md:text-7xl font-bold text-center">
          Praxis
        </div>
        <div className="font-extralight text-base md:text-4xl py-4 text-center">
          Where Theory Becomes Execution
        </div>
        <button
          onClick={() => router.push("/overview")}
          className="bg-black rounded-full w-fit text-white px-6 py-3 cursor-pointer text-sm font-medium hover:bg-black/85 transition-colors"
        >
          Enter Dashboard
        </button>
      </motion.div>
    </AuroraBackground>
  );
}
