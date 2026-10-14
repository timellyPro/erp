"use client";

import { PRIMARY_COLOR } from "../../constants/colors";
import SuccessPopups from "../common/SuccessPopUps";
import PageHeader from "../common/PageHeader";
import { useAddSchoolState, AddSchoolFormFields } from "./shared/add-school";

export default function AddSchool() {
  const {
    form,
    setForm,
    errors,
    loading,
    error,
    showSuccess,
    setShowSuccess,
    hasFieldErrors,
    handleChange,
    handleSignup,
    handleReset,
  } = useAddSchoolState();

  /* ---------------- UI ---------------- */

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className=" bg-transparent min-h-screen">
          <div className="w-full space-y-6">
            <PageHeader
              title="Add New School"
              subtitle="Create a new school and onboard its admin here"
              className="w-full mb-0"
            />
            <form
              onSubmit={handleSignup}
              className="w-full rounded-2xl p-4 sm:p-6 lg:p-8 shadow-sm border border-gray-500/20"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
            >
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <h1 className="text-xl sm:text-2xl font-semibold text-white">
                Add New School
              </h1>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto text-gray-200 border border-gray-300/20 px-4 py-2 rounded-lg hover:bg-white/10 cursor-pointer"
                >
                  Reset
                </button>

                <button
                  type="submit"
                  disabled={loading || error !== "" || hasFieldErrors}
                  style={{ backgroundColor: PRIMARY_COLOR }}
                  className="w-full sm:w-auto text-black px-6 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-60 cursor-pointer"
                >
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {/* Backend error → RED */}
            {error && <p className="text-red-500 mb-4">{error}</p>}

            <AddSchoolFormFields
              form={form}
              setForm={setForm}
              errors={errors}
              handleChange={handleChange}
            />
              </form>

              <SuccessPopups
                open={showSuccess}
                title="School Created and Onboarded Successfully!"
                onClose={() => {
                  setShowSuccess(false);
                  handleReset();
                }}
              />
            </div>
          </div>
          </main>
        </>
      );
}
