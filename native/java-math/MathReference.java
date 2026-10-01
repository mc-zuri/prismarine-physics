import java.io.*;

// Independent reference process: preserve the raw result bits, including signed zero.
class MathReference {
    public static void main(String[] args) throws IOException {
        DataInputStream input = new DataInputStream(new BufferedInputStream(System.in));
        DataOutputStream output = new DataOutputStream(new BufferedOutputStream(System.out));
        while (true) {
            double x;
            try { x = input.readDouble(); } catch (EOFException end) { break; }
            output.writeLong(Double.doubleToRawLongBits(Math.sin(x)));
            output.writeLong(Double.doubleToRawLongBits(Math.cos(x)));
        }
        output.flush();
    }
}
