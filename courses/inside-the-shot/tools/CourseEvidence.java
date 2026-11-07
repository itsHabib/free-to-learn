// Export inspectable evidence from an original RE Lab target.
// @category RE Lab

import com.google.gson.GsonBuilder;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

public class CourseEvidence extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) {
            throw new IllegalArgumentException("Expected output file and one or more function names");
        }
        Path output = Path.of(args[0]);
        if (Files.exists(output)) {
            throw new IllegalArgumentException("Refusing to overwrite existing evidence");
        }
        Set<String> requested = new LinkedHashSet<>(Arrays.asList(args).subList(1, args.length));
        Set<String> found = new LinkedHashSet<>();
        ArrayList<Map<String, Object>> functions = new ArrayList<>();
        DecompInterface decompiler = new DecompInterface();
        try {
            if (!decompiler.openProgram(currentProgram)) {
                throw new IllegalStateException("Decompiler could not open imported program");
            }
            FunctionIterator iterator = currentProgram.getFunctionManager().getFunctions(true);
            while (iterator.hasNext()) {
                Function function = iterator.next();
                String name = function.getName();
                String plain = name.startsWith("_") ? name.substring(1) : name;
                if (!requested.contains(name) && !requested.contains(plain)) {
                    continue;
                }
                found.add(requested.contains(name) ? name : plain);
                DecompileResults result = decompiler.decompileFunction(function, 30, monitor);
                if (!result.decompileCompleted() || result.getDecompiledFunction() == null) {
                    throw new IllegalStateException("Decompilation failed for " + name + ": " + result.getErrorMessage());
                }
                ArrayList<Map<String, String>> instructions = new ArrayList<>();
                InstructionIterator listing = currentProgram.getListing().getInstructions(function.getBody(), true);
                while (listing.hasNext()) {
                    Instruction instruction = listing.next();
                    if (instructions.size() >= 10000) {
                        throw new IllegalStateException("Function exceeds bounded teaching export");
                    }
                    Map<String, String> row = new LinkedHashMap<>();
                    row.put("address", instruction.getAddress().toString());
                    row.put("text", instruction.toString());
                    instructions.add(row);
                }
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("name", name);
                item.put("entry", function.getEntryPoint().toString());
                item.put("signature", function.getSignature().toString());
                item.put("calling_convention", function.getCallingConventionName());
                item.put("instructions", instructions);
                item.put("decompiled_c", result.getDecompiledFunction().getC());
                functions.add(item);
            }
        } finally {
            decompiler.dispose();
        }
        if (!found.equals(requested)) {
            Set<String> missing = new LinkedHashSet<>(requested);
            missing.removeAll(found);
            throw new IllegalStateException("Requested functions missing: " + missing);
        }
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("schema", "re-lab-ghidra-evidence-v1");
        evidence.put("program", currentProgram.getName());
        evidence.put("format", currentProgram.getExecutableFormat());
        evidence.put("language", currentProgram.getLanguageID().toString());
        evidence.put("compiler_spec", currentProgram.getCompilerSpec().getCompilerSpecID().toString());
        evidence.put("image_base", currentProgram.getImageBase().toString());
        evidence.put("functions", functions);
        evidence.put("limit", "Actual headless import, analysis and decompilation; not GUI or human-learning evidence");
        Files.writeString(output, new GsonBuilder().setPrettyPrinting().create().toJson(evidence) + "\n", StandardCharsets.UTF_8);
        println("RE_LAB_EVIDENCE_COMPLETE " + output);
    }
}
